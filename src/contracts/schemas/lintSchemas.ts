import { z } from 'zod'

export const ESLintMessageSchema = z.object({
  line: z.number().optional(),
  column: z.number().optional(),
  severity: z.number(),
  message: z.string(),
  ruleId: z.string().optional(),
})

export const ESLintResultSchema = z.object({
  filePath: z.string(),
  messages: z.array(ESLintMessageSchema).optional(),
})

export const GolangciLintPositionSchema = z.object({
  Filename: z.string(),
  Line: z.number(),
  Column: z.number(),
})

export const GolangciLintIssueSchema = z.object({
  FromLinter: z.string(),
  Text: z.string(),
  Severity: z.string(),
  Pos: GolangciLintPositionSchema,
})

export const GolangciLintResultSchema = z.object({
  Issues: z.array(GolangciLintIssueSchema).optional(),
})

export const StatixSuggestionSchema = z.object({
  at: z.object({
    from: z.number(),
    to: z.number(),
  }),
  note: z.string(),
  suggestion: z.object({
    fix: z.string(),
    replacement: z.string(),
  }).optional(),
})

export const StatixReportSchema = z.object({
  file: z.string(),
  report_kind: z.enum(['warn', 'error']),
  note: z.string(),
  suggestions: z.array(StatixSuggestionSchema),
})

export const NixfCursorSchema = z.object({
  column: z.number(),
  line: z.number(),
  offset: z.number(),
})

export const NixfRangeSchema = z.object({
  lCur: NixfCursorSchema,
  rCur: NixfCursorSchema,
})

export const NixfNoteSchema = z.object({
  args: z.array(z.string()),
  kind: z.number(),
  message: z.string(),
  range: NixfRangeSchema,
  sname: z.string(),
  tag: z.array(z.unknown()),
})

export const NixfDiagnosticSchema = z.object({
  args: z.array(z.string()),
  fixes: z.array(z.unknown()),
  kind: z.number(),
  message: z.string(),
  notes: z.array(NixfNoteSchema),
  range: NixfRangeSchema,
  severity: z.number(), // 0=Fatal, 1=Error, 2=Warning, 3=Info, 4=Hint
  sname: z.string(),
  tag: z.array(z.unknown()),
})

export const LintIssueSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  rule: z.string().optional(),
})

export const LintResultSchema = z.object({
  timestamp: z.string(),
  files: z.array(z.string()),
  issues: z.array(LintIssueSchema),
  errorCount: z.number(),
  warningCount: z.number(),
})

export const LintDataSchema = LintResultSchema.extend({
  hasNotifiedAboutLintIssues: z.boolean(),
})

export type ESLintMessage = z.infer<typeof ESLintMessageSchema>
export type ESLintResult = z.infer<typeof ESLintResultSchema>
export type GolangciLintPosition = z.infer<typeof GolangciLintPositionSchema>
export type GolangciLintIssue = z.infer<typeof GolangciLintIssueSchema>
export type GolangciLintResult = z.infer<typeof GolangciLintResultSchema>
export type StatixSuggestion = z.infer<typeof StatixSuggestionSchema>
export type StatixReport = z.infer<typeof StatixReportSchema>
export type NixfCursor = z.infer<typeof NixfCursorSchema>
export type NixfRange = z.infer<typeof NixfRangeSchema>
export type NixfNote = z.infer<typeof NixfNoteSchema>
export type NixfDiagnostic = z.infer<typeof NixfDiagnosticSchema>
export type LintData = z.infer<typeof LintDataSchema>
export type LintIssue = z.infer<typeof LintIssueSchema>
export type LintResult = z.infer<typeof LintResultSchema>
