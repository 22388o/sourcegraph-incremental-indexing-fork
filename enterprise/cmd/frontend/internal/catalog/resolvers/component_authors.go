package resolvers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/gob"
	"encoding/hex"
	"fmt"
	"io/fs"
	"io/ioutil"
	"log"
	"os"
	pathpkg "path"
	"sort"
	"sync"
	"time"

	gql "github.com/sourcegraph/sourcegraph/cmd/frontend/graphqlbackend"
	"github.com/sourcegraph/sourcegraph/internal/api"
	"github.com/sourcegraph/sourcegraph/internal/database"
	"github.com/sourcegraph/sourcegraph/internal/vcs/git"
)

func (r *catalogComponentResolver) Authors(ctx context.Context) (*[]gql.CatalogComponentAuthorEdgeResolver, error) {
	entries, err := git.ReadDir(ctx, api.RepoName(r.sourceRepo), api.CommitID(r.sourceCommit), r.sourcePath, true)
	if err != nil {
		return nil, err
	}

	var (
		mu             sync.Mutex
		all            = map[string]*blameAuthor{}
		totalLineCount int
		allErr         error
		wg             sync.WaitGroup
	)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}

		wg.Add(1)
		go func(e fs.FileInfo) {
			defer wg.Done()

			authorsByEmail, lineCount, err := getBlameAuthorsCached(ctx, api.RepoName(r.sourceRepo), api.CommitID(r.sourceCommit), e.Name())
			if err != nil {
				mu.Lock()
				if allErr == nil {
					allErr = err
				}
				mu.Unlock()
				return
			}

			mu.Lock()
			defer mu.Unlock()
			totalLineCount += lineCount
			for email, a := range authorsByEmail {
				ca := all[email]
				if ca == nil {
					all[email] = a
				} else {
					ca.LineCount += a.LineCount
					if a.LastCommitDate.After(ca.LastCommitDate) {
						ca.Name = a.Name // use latest name in case it changed over time
						ca.LastCommit = a.LastCommit
						ca.LastCommitDate = a.LastCommitDate
					}
				}
			}
		}(e)
	}
	wg.Wait()
	if allErr != nil {
		return nil, err
	}

	edges := make([]gql.CatalogComponentAuthorEdgeResolver, 0, len(all))
	for _, a := range all {
		edges = append(edges, &catalogComponentAuthorEdgeResolver{
			db:             r.db,
			component:      r,
			data:           a,
			totalLineCount: totalLineCount,
		})
	}

	sort.Slice(edges, func(i, j int) bool {
		return edges[i].AuthoredLineCount() > edges[j].AuthoredLineCount()
	})

	return &edges, nil
}

type blameAuthor struct {
	Name, Email    string
	LineCount      int
	LastCommit     api.CommitID
	LastCommitDate time.Time
}

// TODO(sqs): the "reduce" step is duplicated in this getBlameAuthors func body and above in the
// Authors method, maybe make this func return raw-er data to avoid the duplication?
func getBlameAuthors(ctx context.Context, repoName api.RepoName, commit api.CommitID, path string) (authorsByEmail map[string]*blameAuthor, totalLineCount int, err error) {
	// TODO(sqs): SECURITY does this check perms?
	hunks, err := git.BlameFile(ctx, repoName, path, &git.BlameOptions{NewestCommit: commit})
	if err != nil {
		return nil, 0, err
	}

	// TODO(sqs): normalize email (eg case-insensitive?)
	authorsByEmail = map[string]*blameAuthor{}
	for _, hunk := range hunks {
		a := authorsByEmail[hunk.Author.Email]
		if a == nil {
			a = &blameAuthor{
				Name:  hunk.Author.Name,
				Email: hunk.Author.Email,
			}
			authorsByEmail[hunk.Author.Email] = a
		}

		lineCount := hunk.EndLine - hunk.StartLine
		totalLineCount += lineCount
		a.LineCount += lineCount

		if hunk.Author.Date.After(a.LastCommitDate) {
			a.Name = hunk.Author.Name // use latest name in case it changed over time
			a.LastCommit = hunk.CommitID
			a.LastCommitDate = hunk.Author.Date
		}
	}

	return authorsByEmail, totalLineCount, nil
}

// TODO(sqs): HACK SECURITY this bypasses repo perms and is just a hack for perf
func getBlameAuthorsCached(ctx context.Context, repoName api.RepoName, commit api.CommitID, path string) (authorsByEmail map[string]*blameAuthor, totalLineCount int, err error) {
	type cacheEntry struct {
		AuthorsByEmail map[string]*blameAuthor
		TotalLineCount int
	}

	cachePath := func(key string) string {
		const dir = "/tmp/sqs-wip-cache"
		_ = os.MkdirAll(dir, 0700)

		h := sha256.Sum256([]byte(key))
		name := hex.EncodeToString(h[:])

		return pathpkg.Join(dir, name)
	}
	get := func(key string) (cacheEntry, bool) {
		b, err := ioutil.ReadFile(cachePath(key))
		if os.IsNotExist(err) {
			return cacheEntry{}, false
		}
		if err != nil {
			panic(err)
		}
		var v cacheEntry
		if err := gob.NewDecoder(bytes.NewReader(b)).Decode(&v); err != nil {
			panic(err)
		}
		return v, true
	}
	set := func(key string, data cacheEntry) {
		var buf bytes.Buffer
		if err := gob.NewEncoder(&buf).Encode(data); err != nil {
			panic(err)
		}
		if err := ioutil.WriteFile(cachePath(key), buf.Bytes(), 0600); err != nil {
			panic(err)
		}
	}

	key := fmt.Sprintf("%s:%s:%s", repoName, commit, path)

	v, ok := get(key)
	if ok {
		log.Println("HIT")
		return v.AuthorsByEmail, v.TotalLineCount, nil
	}
	log.Println("MISS")

	authorsByEmail, totalLineCount, err = getBlameAuthors(ctx, repoName, commit, path)
	if err == nil {
		set(key, cacheEntry{AuthorsByEmail: authorsByEmail, TotalLineCount: totalLineCount})
	}
	return
}

type catalogComponentAuthorEdgeResolver struct {
	db             database.DB
	component      *catalogComponentResolver
	data           *blameAuthor
	totalLineCount int
}

func (r *catalogComponentAuthorEdgeResolver) Component() gql.CatalogComponentResolver {
	return r.component
}

func (r *catalogComponentAuthorEdgeResolver) Person() *gql.PersonResolver {
	return gql.NewPersonResolver(r.db, r.data.Name, r.data.Email, true)
}

func (r *catalogComponentAuthorEdgeResolver) AuthoredLineCount() int32 {
	return int32(r.data.LineCount)
}

func (r *catalogComponentAuthorEdgeResolver) AuthoredLineProportion() float64 {
	return float64(r.data.LineCount) / float64(r.totalLineCount)
}

func (r *catalogComponentAuthorEdgeResolver) LastCommit(ctx context.Context) (*gql.GitCommitResolver, error) {
	repoResolver, err := r.component.sourceRepoResolver(ctx)
	if err != nil {
		return nil, err
	}

	return gql.NewGitCommitResolver(r.db, repoResolver, r.data.LastCommit, nil), nil
}
