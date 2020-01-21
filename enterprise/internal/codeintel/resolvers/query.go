package resolvers

import (
	"context"
	"encoding/base64"
	"fmt"

	"github.com/sourcegraph/go-diff/diff"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/backend"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/graphqlbackend"
	"github.com/sourcegraph/sourcegraph/enterprise/internal/codeintel/lsifserver/client"
	"github.com/sourcegraph/sourcegraph/internal/api"
	"github.com/sourcegraph/sourcegraph/internal/lsif"
	"github.com/sourcegraph/sourcegraph/internal/vcs/git"
)

type lsifQueryResolver struct {
	repositoryResolver *graphqlbackend.RepositoryResolver
	commit             graphqlbackend.GitObjectID
	path               string
	upload             *lsif.LSIFUpload
}

var _ graphqlbackend.LSIFQueryResolver = &lsifQueryResolver{}

func (r *lsifQueryResolver) Commit(ctx context.Context) (*graphqlbackend.GitCommitResolver, error) {
	return resolveCommit(ctx, r.repositoryResolver, r.upload.Commit)
}

func (r *lsifQueryResolver) Definitions(ctx context.Context, args *graphqlbackend.LSIFQueryPositionArgs) (graphqlbackend.LocationConnectionResolver, error) {
	position, err := r.adjustPosition(ctx, args.Line, args.Character)
	if err != nil {
		return nil, err
	}

	opts := &struct {
		RepoID    api.RepoID
		Commit    graphqlbackend.GitObjectID
		Path      string
		Line      int32
		Character int32
		UploadID  int64
	}{
		RepoID:    r.repositoryResolver.Type().ID,
		Commit:    r.commit,
		Path:      r.path,
		Line:      position.Line,
		Character: position.Character,
		UploadID:  r.upload.ID,
	}

	locations, nextURL, err := client.DefaultClient.Definitions(ctx, opts)
	if err != nil {
		return nil, err
	}

	return &locationConnectionResolver{
		locations: locations,
		nextURL:   nextURL,
	}, nil
}

func (r *lsifQueryResolver) References(ctx context.Context, args *graphqlbackend.LSIFPagedQueryPositionArgs) (graphqlbackend.LocationConnectionResolver, error) {
	position, err := r.adjustPosition(ctx, args.Line, args.Character)
	if err != nil {
		return nil, err
	}

	opts := &struct {
		RepoID    api.RepoID
		Commit    graphqlbackend.GitObjectID
		Path      string
		Line      int32
		Character int32
		UploadID  int64
		Limit     *int32
		Cursor    *string
	}{
		RepoID:    r.repositoryResolver.Type().ID,
		Commit:    r.commit,
		Path:      r.path,
		Line:      position.Line,
		Character: position.Character,
		UploadID:  r.upload.ID,
	}
	if args.First != nil {
		opts.Limit = args.First
	}
	if args.After != nil {
		decoded, err := base64.StdEncoding.DecodeString(*args.After)
		if err != nil {
			return nil, err
		}
		nextURL := string(decoded)
		opts.Cursor = &nextURL
	}

	locations, nextURL, err := client.DefaultClient.References(ctx, opts)
	if err != nil {
		return nil, err
	}

	return &locationConnectionResolver{
		locations: locations,
		nextURL:   nextURL,
	}, nil
}

func (r *lsifQueryResolver) Hover(ctx context.Context, args *graphqlbackend.LSIFQueryPositionArgs) (graphqlbackend.HoverResolver, error) {
	position, err := r.adjustPosition(ctx, args.Line, args.Character)
	if err != nil {
		return nil, err
	}

	text, lspRange, err := client.DefaultClient.Hover(ctx, &struct {
		RepoID    api.RepoID
		Commit    graphqlbackend.GitObjectID
		Path      string
		Line      int32
		Character int32
		UploadID  int64
	}{
		RepoID:    r.repositoryResolver.Type().ID,
		Commit:    r.commit,
		Path:      r.path,
		Line:      position.Line,
		Character: position.Character,
		UploadID:  r.upload.ID,
	})
	if err != nil {
		return nil, err
	}

	return &hoverResolver{
		text:     text,
		lspRange: lspRange,
	}, nil
}

type Position struct {
	Line      int32
	Character int32
}

func (r *lsifQueryResolver) adjustPosition(ctx context.Context, line, character int32) (*Position, error) {
	base := r.upload.Commit
	head := string(r.commit)

	if base == head {
		return &Position{
			Line:      line,
			Character: character,
		}, nil
	}

	cachedRepo, err := backend.CachedGitRepo(ctx, r.repositoryResolver.Type())
	if err != nil {
		return nil, err
	}

	rdr, err := git.ExecReader(ctx, *cachedRepo, []string{"diff", base, head, "--", r.path})
	if err != nil {
		return nil, err
	}
	defer rdr.Close()

	diff, err := diff.NewFileDiffReader(rdr).Read()
	if err != nil {
		return nil, err
	}

	for _, hunk := range diff.Hunks {
		// TODO
		fmt.Printf("SHIFTING %d (len %d) -> %d (len %d)\n", hunk.OrigStartLine, hunk.OrigLines, hunk.NewStartLine, hunk.NewLines)
	}

	return &Position{
		Line:      line,
		Character: character,
	}, nil
}
