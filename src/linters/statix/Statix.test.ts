import { describe, it, expect, vi, afterEach } from 'vitest'

// Create the mock function outside of the mock declarations
const mockExecFileAsync = vi.fn()

// Mock the modules before importing
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}))

import { Statix } from './Statix'

describe('Statix', () => {
  const statix = new Statix()

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('successful execution with no issues', () => {
    it('returns empty results when no issues found', async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      })

      const result = await statix.lint(['test.nix'])

      expect(mockExecFileAsync).toHaveBeenCalledWith('statix', [
        'check',
        'test.nix',
        '--output',
        'json',
      ], { shell: process.platform === 'win32' })

      expect(result).toMatchObject({
        files: ['test.nix'],
        issues: [],
        errorCount: 0,
        warningCount: 0,
      })
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
    })
  })

  describe('execution with lint issues', () => {
    it('parses JSON output with warnings correctly', async () => {
      const statixOutput = JSON.stringify({
        file: '/path/to/test.nix',
        report_kind: 'warn',
        note: 'Found issue [W04]: manual inherit',
        suggestions: [
          {
            at: { from: 10, to: 20 },
            note: 'manual inherit [W04]',
            suggestion: {
              fix: 'use automatic inherit',
              replacement: 'inherit foo;',
            },
          },
        ],
      })

      const error = new Error('Command failed') as Error & { stdout: string }
      error.stdout = statixOutput
      mockExecFileAsync.mockRejectedValueOnce(error)

      const result = await statix.lint(['test.nix'])

      expect(result).toMatchObject({
        files: ['test.nix'],
        errorCount: 0,
        warningCount: 1,
      })

      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]).toMatchObject({
        file: '/path/to/test.nix',
        line: 1,
        column: 10,
        severity: 'warning',
        message: 'manual inherit [W04]',
        rule: 'W04',
      })
    })

    it('parses JSON output with errors correctly', async () => {
      const statixOutput = JSON.stringify({
        file: '/path/to/error.nix',
        report_kind: 'error',
        note: 'Found critical issue [E01]: syntax error',
        suggestions: [
          {
            at: { from: 5, to: 15 },
            note: 'syntax error [E01]',
          },
        ],
      })

      const error = new Error('Command failed') as Error & { stdout: string }
      error.stdout = statixOutput
      mockExecFileAsync.mockRejectedValueOnce(error)

      const result = await statix.lint(['error.nix'])

      expect(result).toMatchObject({
        files: ['error.nix'],
        errorCount: 1,
        warningCount: 0,
      })

      expect(result.issues[0]).toMatchObject({
        file: '/path/to/error.nix',
        severity: 'error',
        message: 'syntax error [E01]',
        rule: 'E01',
      })
    })

    it('handles multiple JSON objects (one per line)', async () => {
      const output1 = {
        file: '/path/to/test1.nix',
        report_kind: 'warn',
        note: 'Warning 1',
        suggestions: [{ at: { from: 1, to: 2 }, note: 'Fix 1' }],
      }
      const output2 = {
        file: '/path/to/test2.nix', 
        report_kind: 'error',
        note: 'Error 1',
        suggestions: [{ at: { from: 3, to: 4 }, note: 'Fix 2' }],
      }

      const statixOutput = JSON.stringify(output1) + '\n' + JSON.stringify(output2)

      const error = new Error('Command failed') as Error & { stdout: string }
      error.stdout = statixOutput
      mockExecFileAsync.mockRejectedValueOnce(error)

      const result = await statix.lint(['test1.nix', 'test2.nix'])

      expect(result.issues).toHaveLength(2)
      expect(result.errorCount).toBe(1)
      expect(result.warningCount).toBe(1)
    })
  })

  describe('configuration handling', () => {
    it('includes config path when provided', async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      })

      await statix.lint(['test.nix'], '/path/to/statix.toml')

      expect(mockExecFileAsync).toHaveBeenCalledWith('statix', [
        'check',
        'test.nix',
        '--output',
        'json',
        '--config',
        '/path/to/statix.toml',
      ], { shell: process.platform === 'win32' })
    })
  })

  describe('error handling', () => {
    it('handles malformed JSON gracefully', async () => {
      const error = new Error('Command failed') as Error & { stdout: string }
      error.stdout = 'invalid json output'
      mockExecFileAsync.mockRejectedValueOnce(error)

      const result = await statix.lint(['test.nix'])

      expect(result.issues).toHaveLength(0)
      expect(result.errorCount).toBe(0)
      expect(result.warningCount).toBe(0)
    })

    it('handles empty stdout', async () => {
      const error = new Error('Command failed') as Error & { stdout: string }
      error.stdout = ''
      mockExecFileAsync.mockRejectedValueOnce(error)

      const result = await statix.lint(['test.nix'])

      expect(result.issues).toHaveLength(0)
    })

    it('re-throws non-exec errors', async () => {
      const nonExecError = new Error('Different error')
      mockExecFileAsync.mockRejectedValueOnce(nonExecError)

      await expect(statix.lint(['test.nix'])).rejects.toThrow('Different error')
    })
  })

  describe('rule extraction', () => {
    it('extracts rule codes from messages with brackets', async () => {
      const statixOutput = JSON.stringify({
        file: '/path/to/test.nix',
        report_kind: 'warn',
        note: 'Issue description',
        suggestions: [
          {
            at: { from: 10, to: 20 },
            note: 'Some message [W04] with rule code',
          },
        ],
      })

      const error = new Error('Command failed') as Error & { stdout: string }
      error.stdout = statixOutput
      mockExecFileAsync.mockRejectedValueOnce(error)

      const result = await statix.lint(['test.nix'])

      expect(result.issues[0].rule).toBe('W04')
    })

    it('returns undefined when no rule code in message', async () => {
      const statixOutput = JSON.stringify({
        file: '/path/to/test.nix',
        report_kind: 'warn',
        note: 'Issue description',
        suggestions: [
          {
            at: { from: 10, to: 20 },
            note: 'Message without rule code',
          },
        ],
      })

      const error = new Error('Command failed') as Error & { stdout: string }
      error.stdout = statixOutput
      mockExecFileAsync.mockRejectedValueOnce(error)

      const result = await statix.lint(['test.nix'])

      expect(result.issues[0].rule).toBeUndefined()
    })
  })
})