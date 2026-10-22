package ui

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/yuanhua/image-gptcodex/pkg/client"
)

func TestNormalizeReleaseVersion(t *testing.T) {
	if got := normalizeReleaseVersion(" v1.1.6 "); got != "1.1.6" {
		t.Fatalf("normalizeReleaseVersion() = %q, want 1.1.6", got)
	}
	if got := normalizeReleaseVersion("1.1.12-ci.37.1+f1b0c7428c17"); got != "1.1.12-ci.37.1+f1b0c7428c17" {
		t.Fatalf("normalizeReleaseVersion() = %q, want ci version", got)
	}
	if got := normalizeReleaseVersion("release-1.1.6"); got != "" {
		t.Fatalf("normalizeReleaseVersion() = %q, want empty", got)
	}
}

func TestSemverCore(t *testing.T) {
	if got := semverCore("v1.1.13"); got != "1.1.13" {
		t.Fatalf("semverCore() = %q, want 1.1.13", got)
	}
	if got := semverCore("1.1.13-ci.49.1+4c4e3507d6ca"); got != "1.1.13" {
		t.Fatalf("semverCore() = %q, want 1.1.13", got)
	}
}

func TestCheckForAppUpdateDoesNotFlagSameCoreReleaseForCIBuild(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{
			"tag_name":"v1.1.13",
			"name":"v1.1.13",
			"html_url":"https://example.com/releases/v1.1.13",
			"published_at":"2026-06-07T00:00:00Z",
			"body":"bugfixes",
			"draft":false
		}`)
	}))
	defer srv.Close()

	original := client.Version
	client.Version = "1.1.13-ci.49.1+4c4e3507d6ca"
	t.Cleanup(func() { client.Version = original })

	info, err := checkForAppUpdateWithClient(context.Background(), &http.Client{}, srv.URL)
	if err != nil {
		t.Fatalf("checkForAppUpdateWithClient() error = %v", err)
	}
	if info.HasUpdate {
		t.Fatalf("HasUpdate = true, want false for same-core CI build vs release")
	}
	if info.CurrentVersion != "1.1.13-ci.49.1+4c4e3507d6ca" {
		t.Fatalf("CurrentVersion = %q", info.CurrentVersion)
	}
	if info.LatestVersion != "1.1.13" {
		t.Fatalf("LatestVersion = %q", info.LatestVersion)
	}
}

func TestCheckForAppUpdateTreats404AsNoRelease(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, `{"message":"Not Found","documentation_url":"https://docs.github.com/rest"}`)
	}))
	defer srv.Close()

	info, err := checkForAppUpdateWithClient(context.Background(), &http.Client{}, srv.URL)
	if err != nil {
		t.Fatalf("checkForAppUpdateWithClient() error = %v, want nil for 404", err)
	}
	if !info.NoRelease {
		t.Fatal("NoRelease = false, want true")
	}
	if info.HasUpdate {
		t.Fatal("HasUpdate = true, want false")
	}
	if info.CurrentVersion == "" {
		t.Fatal("CurrentVersion is empty, want the running version")
	}
	if info.ReleaseURL != releasesPageURL {
		t.Fatalf("ReleaseURL = %q, want %q", info.ReleaseURL, releasesPageURL)
	}
	if shouldShowAppUpdate(&info, "") {
		t.Fatal("expected no update modal while the repository has no release")
	}
}

func TestShouldShowAppUpdateHonoursIgnoredReleaseTag(t *testing.T) {
	info := &appUpdateInfo{
		ReleaseTag: "v1.1.13",
		HasUpdate:  true,
	}
	if shouldShowAppUpdate(info, "") != true {
		t.Fatal("expected update to show when nothing is ignored")
	}
	if shouldShowAppUpdate(info, "v1.1.13") {
		t.Fatal("expected ignored release tag to suppress update modal")
	}
	if shouldShowAppUpdate(&appUpdateInfo{HasUpdate: false}, "") {
		t.Fatal("expected no modal when no update is available")
	}
}
