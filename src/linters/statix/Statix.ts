import {
  LintResult,
  LintIssue,
  StatixReport,
} from '../../contracts/schemas/lintSchemas'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { Linter } from '../Linter'

const execFileAsync = promisify(execFile)

export class Statix implements Linter {
  async lint(filePaths: string[], configPath?: string): Promise<LintResult> {
    const timestamp = new Date().toISOString()
    const args = buildArgs(filePaths, configPath)

    try {
      await execFileAsync('statix', args, { shell: process.platform === 'win32' })
      return createLintData(timestamp, filePaths, [])
    } catch (error) {
      if (!isExecError(error)) throw error

      const results = parseResults(error.stdout)
      return createLintData(timestamp, filePaths, results)
    }
  }
}

// Helper functions
const buildArgs = (files: string[], configPath?: string): string[] => {
  const args = ['check', ...files, '--output', 'json']
  if (configPath) {
    args.push('--config', configPath)
  }
  return args
}

const isExecError = (error: unknown): error is Error & { stdout?: string } =>
  error !== null && typeof error === 'object' && 'stdout' in error

const parseResults = (stdout?: string): StatixReport[] => {
  if (!stdout?.trim()) return []
  
  try {
    // Statix outputs one JSON object per line
    const lines = stdout.trim().split('\n').filter(Boolean)
    return lines.map(line => JSON.parse(line))
  } catch {
    return []
  }
}

const createLintData = (
  timestamp: string,
  files: string[],
  results: StatixReport[]
): LintResult => {
  const issues = extractIssues(results)
  return {
    timestamp,
    files,
    issues,
    errorCount: countBySeverity(issues, 'error'),
    warningCount: countBySeverity(issues, 'warning'),
  }
}

const extractIssues = (results: StatixReport[]): LintIssue[] =>
  results.flatMap(report => 
    report.suggestions.map(suggestion => toIssue(report, suggestion))
  )

const toIssue = (report: StatixReport, suggestion: any): LintIssue => {
  // Note: Statix only provides character positions (from/to), not line numbers
  // Using line 1 as fallback since accurate line conversion would require file parsing
  return {
    file: report.file,
    line: 1, // Statix doesn't provide line numbers, only character positions
    column: suggestion.at.from,
    severity: report.report_kind === 'error' ? 'error' : 'warning',
    message: suggestion.note,
    rule: extractRuleFromMessage(suggestion.note),
  }
}

const extractRuleFromMessage = (message: string): string | undefined => {
  // Statix messages often contain rule codes like [W04]
  const match = message.match(/\[([A-Z]\d+)\]/)
  return match?.[1]
}

const countBySeverity = (
  issues: LintIssue[],
  severity: 'error' | 'warning'
): number => issues.filter((i) => i.severity === severity).length