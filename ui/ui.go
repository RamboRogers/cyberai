package ui

import (
	"embed"
	"io/fs"
	"log"
)

//go:embed static templates
var embeddedFS embed.FS

// Static returns a filesystem for the embedded static assets.
func Static() fs.FS {
	staticFS, err := fs.Sub(embeddedFS, "static")
	if err != nil {
		log.Fatalf("Failed to get embedded static directory: %v", err)
	}
	return staticFS
}

// Templates returns a filesystem for the embedded template assets.
func Templates() fs.FS {
	templatesFS, err := fs.Sub(embeddedFS, "templates")
	if err != nil {
		log.Fatalf("Failed to get embedded templates directory: %v", err)
	}
	return templatesFS
}
