import { describe, it, expect, vi, afterEach } from 'vitest'

// Create mock functions
const mockSpawn = vi.fn()
const mockReadFileSync = vi.fn()

// Mock the modules before importing
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}))

vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
}))

import { NixfTidy } from './NixfTidy'

describe('NixfTidy', () => {
  const nixfTidy = new NixfTidy()

  afterEach(() => {
    vi.clearAllMocks()
  })

  const createMockProcess = (stdout: string = '', stderr: string = '', exitCode: number = 0) => {
    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    }

    mockProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        setTimeout(() => callback(stdout), 0)
      }
    })

    mockProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        setTimeout(() => callback(stderr), 0)
      }
    })

    mockProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        setTimeout(() => callback(exitCode), 0)
      } else if (event === 'error') {
        // Only call error callback if explicitly needed in test
      }
    })

    return mockProcess
  }

  describe('successful execution with no issues', () => {
    it('returns empty results when no issues found', async () => {
      const mockProcess = createMockProcess('[]')
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('{ foo = "bar"; }')

      const result = await nixfTidy.lint(['test.nix'])

      expect(mockSpawn).toHaveBeenCalledWith(
        '/nix/store/k8z4sx1amyqnwwlhw0p2sgca96a68hb0-nixf-2.6.4/bin/nixf-tidy',
        ['--pretty-print', '--variable-lookup']
      )

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
    it('parses nixf-tidy output with duplicate attribute correctly', async () => {
      const nixfOutput = JSON.stringify([{
        args: ['foo'],
        fixes: [],
        kind: 21,
        message: 'duplicated attrname `{}`',
        notes: [{
          args: [],
          kind: 0,
          message: 'previously declared here',
          range: {
            lCur: { column: 2, line: 0, offset: 2 },
            rCur: { column: 5, line: 0, offset: 5 }
          },
          sname: 'note-prev',
          tag: []
        }],
        range: {
          lCur: { column: 15, line: 0, offset: 15 },
          rCur: { column: 18, line: 0, offset: 18 }
        },
        severity: 1,
        sname: 'sema-duplicated-attrname',
        tag: []
      }])

      const mockProcess = createMockProcess(nixfOutput)
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('{ foo = "bar"; foo = "baz"; }')

      const result = await nixfTidy.lint(['test.nix'])

      expect(result).toMatchObject({
        files: ['test.nix'],
        errorCount: 1,
        warningCount: 0,
      })

      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]).toMatchObject({
        file: 'test.nix',
        line: 1, // nixf uses 0-based, we convert to 1-based
        column: 16, // nixf uses 0-based, we convert to 1-based
        severity: 'error',
        message: 'duplicated attrname `foo`',
        rule: 'sema-duplicated-attrname',
      })
    })

    it('parses nixf-tidy output with warnings correctly', async () => {
      const nixfOutput = JSON.stringify([{
        args: ['unusedVar'],
        fixes: [],
        kind: 42,
        message: 'unused variable `{}`',
        notes: [],
        range: {
          lCur: { column: 4, line: 2, offset: 25 },
          rCur: { column: 13, line: 2, offset: 34 }
        },
        severity: 2, // Warning severity
        sname: 'sema-unused-binding',
        tag: []
      }])

      const mockProcess = createMockProcess(nixfOutput)
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('let\n  unusedVar = "unused";\nin "result"')

      const result = await nixfTidy.lint(['test.nix'])

      expect(result).toMatchObject({
        files: ['test.nix'],
        errorCount: 0,
        warningCount: 1,
      })

      expect(result.issues[0]).toMatchObject({
        file: 'test.nix',
        line: 3, // line 2 + 1
        column: 5, // column 4 + 1
        severity: 'warning',
        message: 'unused variable `unusedVar`',
        rule: 'sema-unused-binding',
      })
    })

    it('handles multiple diagnostics', async () => {
      const nixfOutput = JSON.stringify([
        {
          args: ['foo'],
          fixes: [],
          kind: 21,
          message: 'duplicated attrname `{}`',
          notes: [],
          range: {
            lCur: { column: 15, line: 0, offset: 15 },
            rCur: { column: 18, line: 0, offset: 18 }
          },
          severity: 1, // Error
          sname: 'sema-duplicated-attrname',
          tag: []
        },
        {
          args: ['unusedVar'],
          fixes: [],
          kind: 42,
          message: 'unused variable `{}`',
          notes: [],
          range: {
            lCur: { column: 4, line: 1, offset: 25 },
            rCur: { column: 13, line: 1, offset: 34 }
          },
          severity: 2, // Warning
          sname: 'sema-unused-binding',
          tag: []
        }
      ])

      const mockProcess = createMockProcess(nixfOutput)
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('test content')

      const result = await nixfTidy.lint(['test.nix'])

      expect(result.issues).toHaveLength(2)
      expect(result.errorCount).toBe(1)
      expect(result.warningCount).toBe(1)
    })
  })

  describe('multiple files processing', () => {
    it('processes multiple files independently', async () => {
      // First file - no issues
      const mockProcess1 = createMockProcess('[]')
      // Second file - one issue
      const nixfOutput = JSON.stringify([{
        args: ['test'],
        fixes: [],
        kind: 1,
        message: 'test issue `{}`',
        notes: [],
        range: {
          lCur: { column: 0, line: 0, offset: 0 },
          rCur: { column: 4, line: 0, offset: 4 }
        },
        severity: 2,
        sname: 'test-rule',
        tag: []
      }])
      const mockProcess2 = createMockProcess(nixfOutput)

      mockSpawn
        .mockReturnValueOnce(mockProcess1)
        .mockReturnValueOnce(mockProcess2)
      
      mockReadFileSync
        .mockReturnValueOnce('{ foo = "bar"; }')
        .mockReturnValueOnce('{ bar = "baz"; }')

      const result = await nixfTidy.lint(['test1.nix', 'test2.nix'])

      expect(result).toMatchObject({
        files: ['test1.nix', 'test2.nix'],
        errorCount: 0,
        warningCount: 1,
      })

      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].file).toBe('test2.nix')
    })
  })

  describe('error handling', () => {
    it('handles file read errors gracefully', async () => {
      mockReadFileSync.mockImplementationOnce(() => {
        throw new Error('File not found')
      })

      // Mock console.warn to avoid test output noise
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await nixfTidy.lint(['nonexistent.nix'])

      expect(result.issues).toHaveLength(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        'nixf-tidy failed for nonexistent.nix:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('handles nixf-tidy spawn errors', async () => {
      const mockProcess = createMockProcess()
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('spawn failed')), 0)
        }
      })
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('test content')

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await nixfTidy.lint(['test.nix'])

      expect(result.issues).toHaveLength(0)
      consoleSpy.mockRestore()
    })

    it('handles malformed JSON output', async () => {
      const mockProcess = createMockProcess('invalid json')
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('test content')

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await nixfTidy.lint(['test.nix'])

      expect(result.issues).toHaveLength(0)
      consoleSpy.mockRestore()
    })

    it('handles empty output', async () => {
      const mockProcess = createMockProcess('')
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('test content')

      const result = await nixfTidy.lint(['test.nix'])

      expect(result.issues).toHaveLength(0)
    })
  })

  describe('severity conversion', () => {
    it('converts fatal and error severities to error', async () => {
      const nixfOutput = JSON.stringify([
        {
          args: [],
          fixes: [],
          kind: 1,
          message: 'fatal error',
          notes: [],
          range: { lCur: { column: 0, line: 0, offset: 0 }, rCur: { column: 1, line: 0, offset: 1 } },
          severity: 0, // Fatal
          sname: 'fatal-rule',
          tag: []
        },
        {
          args: [],
          fixes: [],
          kind: 2,
          message: 'error',
          notes: [],
          range: { lCur: { column: 0, line: 0, offset: 0 }, rCur: { column: 1, line: 0, offset: 1 } },
          severity: 1, // Error
          sname: 'error-rule',
          tag: []
        }
      ])

      const mockProcess = createMockProcess(nixfOutput)
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('test')

      const result = await nixfTidy.lint(['test.nix'])

      expect(result.errorCount).toBe(2)
      expect(result.warningCount).toBe(0)
      result.issues.forEach(issue => {
        expect(issue.severity).toBe('error')
      })
    })

    it('converts warning, info, and hint severities to warning', async () => {
      const nixfOutput = JSON.stringify([
        {
          args: [],
          fixes: [],
          kind: 1,
          message: 'warning',
          notes: [],
          range: { lCur: { column: 0, line: 0, offset: 0 }, rCur: { column: 1, line: 0, offset: 1 } },
          severity: 2, // Warning
          sname: 'warn-rule',
          tag: []
        },
        {
          args: [],
          fixes: [],
          kind: 2,
          message: 'info',
          notes: [],
          range: { lCur: { column: 0, line: 0, offset: 0 }, rCur: { column: 1, line: 0, offset: 1 } },
          severity: 3, // Info
          sname: 'info-rule',
          tag: []
        },
        {
          args: [],
          fixes: [],
          kind: 3,
          message: 'hint',
          notes: [],
          range: { lCur: { column: 0, line: 0, offset: 0 }, rCur: { column: 1, line: 0, offset: 1 } },
          severity: 4, // Hint
          sname: 'hint-rule',
          tag: []
        }
      ])

      const mockProcess = createMockProcess(nixfOutput)
      mockSpawn.mockReturnValueOnce(mockProcess)
      mockReadFileSync.mockReturnValueOnce('test')

      const result = await nixfTidy.lint(['test.nix'])

      expect(result.errorCount).toBe(0)
      expect(result.warningCount).toBe(3)
      result.issues.forEach(issue => {
        expect(issue.severity).toBe('warning')
      })
    })
  })
})