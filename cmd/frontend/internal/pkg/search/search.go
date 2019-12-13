// Package search provides high level search types and logic.
package search

import (
	"regexp/syntax"
)

func (p *PatternInfo) IsEmpty() bool {
	var pattern string
	switch r := (p.Pattern).(type) {
	case Regexp:
		pattern = string(r)
	case Literal:
		pattern = string(r)
	case Structural:
		pattern = string(r.MatchTemplate)
	default:
		panic("unreachable")
	}
	return pattern == "" && p.ExcludePattern == "" && len(p.IncludePatterns) == 0
}

// Validate returns a non-nil error if PatternInfo is not valid.
func (p *PatternInfo) Validate() error {
	var pattern string

	switch r := (p.Pattern).(type) {
	case Regexp:
		pattern = string(r)
		if _, err := syntax.Parse(pattern, syntax.Perl); err != nil {
			return err
		}
	}

	if p.PathPatternsAreRegExps {
		if p.ExcludePattern != "" {
			if _, err := syntax.Parse(p.ExcludePattern, syntax.Perl); err != nil {
				return err
			}
		}
		for _, expr := range p.IncludePatterns {
			if _, err := syntax.Parse(expr, syntax.Perl); err != nil {
				return err
			}
		}
	}

	return nil
}
