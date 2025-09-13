import {
  LintResult,
  LintIssue,
  NixfDiagnostic,
} from '../../contracts/schemas/lintSchemas'
import { spawn } from 'child_process'
import { Linter } from '../Linter'

export class NixfTidy implements Linter {
  async lint(filePaths: string[], configPath?: string): Promise<LintResult> {
    const timestamp = new Date().toISOString()
    const issues: LintIssue[] = []

    // Process each file individually since nixf-tidy reads from stdin
    for (const filePath of filePaths) {
      try {
        const diagnostics = await this.lintFile(filePath)
        const fileIssues = this.convertDiagnosticsToIssues(filePath, diagnostics)
        issues.push(...fileIssues)
      } catch (error) {
        // If nixf-tidy fails, we don't treat it as a fatal error
        // Just skip this file and continue with others
        console.warn(`nixf-tidy failed for ${filePath}:`, error)
      }
    }

    return {
      timestamp,
      files: filePaths,
      issues,
      errorCount: this.countBySeverity(issues, 'error'),
      warningCount: this.countBySeverity(issues, 'warning'),
    }
  }

  private async lintFile(filePath: string): Promise<NixfDiagnostic[]> {
    return new Promise((resolve, reject) => {
      const nixfPath = '/nix/store/k8z4sx1amyqnwwlhw0p2sgca96a68hb0-nixf-2.6.4/bin/nixf-tidy'
      const process = spawn(nixfPath, ['--pretty-print', '--variable-lookup'])
      
      let stdout = ''
      let stderr = ''

      process.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      process.on('close', (code) => {
        if (code !== 0 && stderr) {
          reject(new Error(`nixf-tidy failed: ${stderr}`))
          return
        }

        try {
          if (!stdout.trim()) {
            resolve([])
            return
          }

          const diagnostics = JSON.parse(stdout) as NixfDiagnostic[]
          resolve(Array.isArray(diagnostics) ? diagnostics : [diagnostics])
        } catch (parseError) {
          reject(new Error(`Failed to parse nixf-tidy output: ${parseError}`))
        }
      })

      process.on('error', (error) => {
        reject(new Error(`Failed to spawn nixf-tidy: ${error.message}`))
      })

      // Read file content and send to stdin
      const fs = require('fs')
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        process.stdin.write(content)
        process.stdin.end()
      } catch (readError) {
        process.kill()
        reject(new Error(`Failed to read file ${filePath}: ${readError}`))
      }
    })
  }

  private convertDiagnosticsToIssues(filePath: string, diagnostics: NixfDiagnostic[]): LintIssue[] {
    return diagnostics.map(diagnostic => ({
      file: filePath,
      line: diagnostic.range.lCur.line + 1, // nixf uses 0-based line numbers
      column: diagnostic.range.lCur.column + 1, // nixf uses 0-based column numbers
      severity: this.convertSeverity(diagnostic.severity),
      message: this.formatMessage(diagnostic),
      rule: diagnostic.sname,
    }))
  }

  private convertSeverity(nixfSeverity: number): 'error' | 'warning' {
    // nixf severity: 0=Fatal, 1=Error, 2=Warning, 3=Info, 4=Hint
    return nixfSeverity <= 1 ? 'error' : 'warning'
  }

  private formatMessage(diagnostic: NixfDiagnostic): string {
    let message = diagnostic.message
    
    // Replace placeholders with actual args
    diagnostic.args.forEach((arg, index) => {
      message = message.replace('{}', arg)
    })

    return message
  }

  private countBySeverity(issues: LintIssue[], severity: 'error' | 'warning'): number {
    return issues.filter(issue => issue.severity === severity).length
  }
}