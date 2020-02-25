// Package query provides facilities for parsing and extracting
// information from search queries.
package query

import (
	"errors"
	"strings"

	"github.com/sourcegraph/sourcegraph/internal/search/query/syntax"
)

var (
	regexpNegatableFieldType = FieldType{Literal: RegexpType, Quoted: RegexpType, Negatable: true}
	stringFieldType          = FieldType{Literal: StringType, Quoted: StringType}

	conf = Config{
		FieldTypes: map[Field]FieldType{
			FieldDefault:     {Literal: RegexpType, Quoted: StringType},
			FieldCase:        {Literal: BoolType, Quoted: BoolType, Singular: true},
			FieldRepo:        regexpNegatableFieldType,
			FieldRepoGroup:   {Literal: StringType, Quoted: StringType, Singular: true},
			FieldFile:        regexpNegatableFieldType,
			FieldFork:        {Literal: StringType, Quoted: StringType, Singular: true},
			FieldArchived:    {Literal: StringType, Quoted: StringType, Singular: true},
			FieldLang:        {Literal: StringType, Quoted: StringType, Negatable: true},
			FieldTyp:         stringFieldType,
			FieldPatternType: {Literal: StringType, Quoted: StringType, Singular: true},
			FieldContent:     {Literal: StringType, Quoted: StringType, Singular: true},

			FieldRepoHasFile:        regexpNegatableFieldType,
			FieldRepoHasCommitAfter: {Literal: StringType, Quoted: StringType, Singular: true},

			FieldBefore:    stringFieldType,
			FieldAfter:     stringFieldType,
			FieldAuthor:    regexpNegatableFieldType,
			FieldCommitter: regexpNegatableFieldType,
			FieldMessage:   regexpNegatableFieldType,

			// Experimental fields:
			FieldIndex:     {Literal: StringType, Quoted: StringType, Singular: true},
			FieldCount:     {Literal: StringType, Quoted: StringType, Singular: true},
			FieldMax:       {Literal: StringType, Quoted: StringType, Singular: true},
			FieldTimeout:   {Literal: StringType, Quoted: StringType, Singular: true},
			FieldReplace:   {Literal: StringType, Quoted: StringType, Singular: true},
			FieldCombyRule: {Literal: StringType, Quoted: StringType, Singular: true},
		},
		FieldAliases: map[string]Field{
			"r":        FieldRepo,
			"g":        FieldRepoGroup,
			"f":        FieldFile,
			"l":        FieldLang,
			"language": FieldLang,
			"since":    FieldAfter,
			"until":    FieldBefore,
			"m":        FieldMessage,
			"msg":      FieldMessage,
		},
	}
)

// A Query is the typechecked representation of a search query.
type Query struct {
	conf *Config // the typechecker config used to produce this query

	Fields // the query fields
}

func Parse(input string) (syntax.ParseTree, error) {
	parseTree, err := syntax.Parse(input)
	if err != nil {
		return nil, err
	}

	// We want to make query fields case insensitive
	for _, expr := range parseTree {
		expr.Field = strings.ToLower(expr.Field)
	}
	return parseTree, nil
}

func Check(parseTree syntax.ParseTree) (*Query, error) {
	checkedFields, err := conf.Check(parseTree)
	if err != nil {
		return nil, err
	}
	return &Query{conf: &conf, Fields: *checkedFields}, nil
}

// ParseAndCheck parses and typechecks a search query using the default
// query type configuration.
func ParseAndCheck(input string) (*Query, error) {
	parseTree, err := Parse(input)
	if err != nil {
		return nil, err
	}

	checkedQuery, err := Check(parseTree)
	if err != nil {
		return nil, err
	}

	return checkedQuery, err
}

func processSearchPattern(q *Query) string {
	var pieces []string
	for _, v := range q.Values(FieldDefault) {
		if piece := v.ToString(); piece != "" {
			pieces = append(pieces, piece)
		}
	}
	return strings.Join(pieces, " ")
}

type ValidationError struct {
	Msg string
}

func (e *ValidationError) Error() string {
	return e.Msg
}

// Validate validates legal combinations of fields and search patterns of a
// successfully parsed query.
func Validate(q *Query, searchType SearchType) error {
	if searchType == SearchTypeStructural {
		if q.Fields[FieldCase] != nil {
			return errors.New(`the parameter "case:" is not valid for structural search, matching is always case-sensitive`)
		}
		if q.Fields[FieldTyp] != nil && processSearchPattern(q) != "" {
			return errors.New(`the parameter "type:" is not valid for structural search, search is always performed on file content`)
		}
	}
	return nil
}

// Process is a top level convenience function for processing a raw string into
// a validated and type checked query, and the parse tree of the raw string.
func Process(queryString string, searchType SearchType) (*Query, syntax.ParseTree, error) {
	parseTree, err := Parse(queryString)
	if err != nil {
		return nil, nil, err
	}

	query, err := Check(parseTree)
	if err != nil {
		return nil, nil, err
	}

	err = Validate(query, searchType)
	if err != nil {
		return nil, nil, err
	}

	return query, parseTree, nil
}

// parseAndCheck is preserved for testing custom Configs only.
func parseAndCheck(conf *Config, input string) (*Query, error) {
	parseTree, err := syntax.Parse(input)
	if err != nil {
		return nil, err
	}

	// We want to make query fields case insensitive
	for _, expr := range parseTree {
		expr.Field = strings.ToLower(expr.Field)
	}

	checkedQuery, err := conf.Check(parseTree)
	if err != nil {
		return nil, err
	}
	return &Query{conf: conf, Fields: *checkedQuery}, nil
}

// BoolValue returns the last boolean value (yes/no) for the field. For example, if the query is
// "foo:yes foo:no foo:yes", then the last boolean value for the "foo" field is true ("yes"). The
// default boolean value is false.
func (q *Query) BoolValue(field Field) bool {
	for _, v := range q.Fields[field] {
		if v.Bool != nil {
			return *v.Bool
		}
	}
	return false // default
}

// IsCaseSensitive reports whether the query's expressions are matched
// case sensitively.
func (q *Query) IsCaseSensitive() bool {
	return q.BoolValue(FieldCase)
}

// Values returns the values for the given field.
func (q *Query) Values(field Field) []*Value {
	if _, ok := q.conf.FieldTypes[field]; !ok {
		panic("no such field: " + field)
	}
	return q.Fields[field]
}

// RegexpPatterns returns the regexp pattern source strings for the given field.
// If the field is not recognized or it is not always regexp-typed, it panics.
func (q *Query) RegexpPatterns(field Field) (values, negatedValues []string) {
	fieldType, ok := q.conf.FieldTypes[field]
	if !ok {
		panic("no such field: " + field)
	}
	if fieldType.Literal != RegexpType || fieldType.Quoted != RegexpType {
		panic("field is not always regexp-typed: " + field)
	}

	for _, v := range q.Fields[field] {
		s := v.ToString()
		if v.Not() {
			negatedValues = append(negatedValues, s)
		} else {
			values = append(values, s)
		}
	}
	return
}

// StringValues returns the string values for the given field. If the field is
// not recognized or it is not always string-typed, it panics.
func (q *Query) StringValues(field Field) (values, negatedValues []string) {
	fieldType, ok := q.conf.FieldTypes[field]
	if !ok {
		panic("no such field: " + field)
	}
	if fieldType.Literal != StringType || fieldType.Quoted != StringType {
		panic("field is not always string-typed: " + field)
	}

	for _, v := range q.Fields[field] {
		if v.Not() {
			negatedValues = append(negatedValues, *v.String)
		} else {
			values = append(values, *v.String)
		}
	}
	return
}

// StringValue returns the string value for the given field.
// It panics if the field is not recognized, it is not always string-typed, or it is not singular.
func (q *Query) StringValue(field Field) (value, negatedValue string) {
	fieldType, ok := q.conf.FieldTypes[field]
	if !ok {
		panic("no such field: " + field)
	}
	if fieldType.Literal != StringType || fieldType.Quoted != StringType {
		panic("field is not always string-typed: " + field)
	}
	if !fieldType.Singular {
		panic("field is not singular: " + field)
	}
	if len(q.Fields[field]) == 0 {
		return "", ""
	}
	v := q.Fields[field][0]
	if v.Not() {
		return "", *v.String
	}
	return *v.String, ""
}
