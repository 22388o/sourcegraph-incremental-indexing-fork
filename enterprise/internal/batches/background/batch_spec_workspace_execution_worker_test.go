	"github.com/keegancsmith/sqlf"
	db := dbtest.NewDB(t, "")
	if err := s.CreateBatchSpecWorkspaceExecutionJob(ctx, job); err != nil {
		t.Fatal(err)
	}

	job.State = btypes.BatchSpecWorkspaceExecutionJobStateProcessing
	job.WorkerHostname = "worker-1"
	if err := s.Exec(ctx, sqlf.Sprintf("UPDATE batch_spec_workspace_execution_jobs SET worker_hostname = %s, state = %s WHERE id = %s", job.WorkerHostname, job.State, job.ID)); err != nil {
	// Add a log entry that contains the changeset spec IDs
		Out:        `stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.95Z","status":"SUCCESS","metadata":{"ids":` + jsonArray + `}} `,
	opts := dbworkerstore.MarkFinalOptions{WorkerHostname: job.WorkerHostname}
	ok, err := executionStore.MarkComplete(context.Background(), int(job.ID), opts)
	if !ok || err != nil {
		t.Fatalf("MarkComplete failed. ok=%t, err=%s", ok, err)
	// Now reload the involved entities and make sure they've been updated correctly
	reloadedJob, err := s.GetBatchSpecWorkspaceExecutionJob(ctx, store.GetBatchSpecWorkspaceExecutionJobOpts{ID: job.ID})
	if err != nil {
		t.Fatalf("failed to reload job: %s", err)
	if reloadedJob.State != btypes.BatchSpecWorkspaceExecutionJobStateCompleted {
		t.Fatalf("wrong state: %s", reloadedJob.State)
	reloadedWorkspace, err := s.GetBatchSpecWorkspace(ctx, store.GetBatchSpecWorkspaceOpts{ID: workspace.ID})
	if err != nil {
		t.Fatalf("failed to reload workspace: %s", err)
	}
	if diff := cmp.Diff(changesetSpecIDs, reloadedWorkspace.ChangesetSpecIDs); diff != "" {
		t.Fatalf("reloaded workspace has wrong changeset spec IDs: %s", diff)
	}
	reloadedSpecs, _, err := s.ListChangesetSpecs(ctx, store.ListChangesetSpecsOpts{LimitOpts: store.LimitOpts{Limit: 0}, IDs: changesetSpecIDs})
	if err != nil {
		t.Fatalf("failed to reload changeset specs: %s", err)
	}
	for _, reloadedSpec := range reloadedSpecs {
		if reloadedSpec.BatchSpecID != batchSpec.ID {
			t.Fatalf("reloaded changeset spec does not have correct batch spec id: %d", reloadedSpec.BatchSpecID)
	}
		entries     []workerutil.ExecutionLogEntry
			entries: []workerutil.ExecutionLogEntry{
				{Key: "setup.firecracker.start"},
				// Reduced log output because we don't care about _all_ lines
				{
					Key: "step.src.0",
					Out: `
stdout: {"operation":"EXECUTING_TASKS","timestamp":"2021-09-09T13:20:32.942Z","status":"SUCCESS"}
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.942Z","status":"STARTED","metadata":{"total":1}}
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.95Z","status":"PROGRESS","metadata":{"done":1,"total":1}}
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.95Z","status":"SUCCESS","metadata":{"ids":["Q2hhbmdlc2V0U3BlYzoiNkxIYWN5dkI3WDYi"]}}

`,
				},
			},
			// Run `echo "QmF0Y2hTcGVjOiJBZFBMTDU5SXJmWCI=" |base64 -d` to get this
			wantRandIDs: []string{"6LHacyvB7X6"},
		},
		{

			name:    "no step.src.0 log entry",
			entries: []workerutil.ExecutionLogEntry{},
			wantErr: ErrNoChangesetSpecIDs,
		},

		{

			name: "no upload step in the output",
			entries: []workerutil.ExecutionLogEntry{
				{
					Key: "step.src.0",
					Out: `stdout: {"operation":"PARSING_BATCH_SPEC","timestamp":"2021-07-06T09:38:51.481Z","status":"STARTED"}
stdout: {"operation":"PARSING_BATCH_SPEC","timestamp":"2021-07-06T09:38:51.481Z","status":"SUCCESS"}
`,
				},
			},
			wantErr: ErrNoChangesetSpecIDs,
		},
		{
			name: "empty array the output",
			entries: []workerutil.ExecutionLogEntry{
					Key: "step.src.0",
					Out: `
stdout: {"operation":"EXECUTING_TASKS","timestamp":"2021-09-09T13:20:32.942Z","status":"SUCCESS"}
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.942Z","status":"STARTED","metadata":{"total":1}}
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.95Z","status":"PROGRESS","metadata":{"done":1,"total":1}}
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.95Z","status":"SUCCESS","metadata":{"ids":[]}}

`,
				},
			},
			wantErr: ErrNoChangesetSpecIDs,
		},

		{
			name: "additional text in log output",
			entries: []workerutil.ExecutionLogEntry{
				{
					Key: "step.src.0",
					Out: `stdout: {"operation":"EXECUTING_TASKS","timestamp":"2021-09-09T13:20:32.941Z","status":"STARTED","metadata":{"tasks":[]}}
stdout: {"operation":"EXECUTING_TASKS","timestamp":"2021-09-09T13:20:32.942Z","status":"SUCCESS"}
stderr: HORSE
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.942Z","status":"STARTED","metadata":{"total":1}}
stderr: HORSE
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.95Z","status":"PROGRESS","metadata":{"done":1,"total":1}}
stderr: HORSE
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.95Z","status":"SUCCESS","metadata":{"ids":["Q2hhbmdlc2V0U3BlYzoiNkxIYWN5dkI3WDYi"]}}
`,

			name: "invalid json",
			entries: []workerutil.ExecutionLogEntry{
					Key: "step.src.0",
					Out: `stdout: {"operation":"PARSING_BATCH_SPEC","timestamp":"2021-07-06T09:38:51.481Z","status":"STARTED"}
stdout: {HOOOORSE}
stdout: {HORSE}
stdout: {HORSE}
`,

		{
			name: "non-json output inbetween valid json",
			entries: []workerutil.ExecutionLogEntry{
				{
					Key: "step.src.0",
					Out: `stdout: {"operation":"PARSING_BATCH_SPEC","timestamp":"2021-07-12T12:25:33.965Z","status":"STARTED"}
stdout: No changeset specs created
stdout: {"operation":"UPLOADING_CHANGESET_SPECS","timestamp":"2021-09-09T13:20:32.95Z","status":"SUCCESS","metadata":{"ids":["Q2hhbmdlc2V0U3BlYzoiNkxIYWN5dkI3WDYi"]}}`,
				},
			},
			wantRandIDs: []string{"6LHacyvB7X6"},
		},
			have, err := extractChangesetSpecRandIDs(tt.entries)