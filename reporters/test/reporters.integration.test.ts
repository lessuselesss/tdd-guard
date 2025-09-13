// test/reporters.integration.test.ts - Updated integration tests with Rust coverage

import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { FileStorage, Config as TDDConfig } from 'tdd-guard'
import type { ReporterConfig, TestResultData, TestScenarios } from './types'

// Extended test error type that includes Rust-specific fields
type TestError = {
  message: string
  expected?: string
  actual?: string
  // Rust-specific fields
  code?: string
  location?: string
  help?: string
  note?: string
}
import {
  createJestReporter,
  createVitestReporter,
  createPhpunitReporter,
  createPytestReporter,
  createGoReporter,
  createRustReporter,
  createNixReporter,
} from './factories'

// Test data structure for each reporter
interface ReporterTestData {
  name: string
  passingResults: unknown
  failingResults: unknown
  importErrorResults: unknown
}

type ReporterName =
  | 'jest'
  | 'vitest'
  | 'phpunit'
  | 'pytest'
  | 'go'
  | 'rust'
  | 'nix'

// Helper to check if nix-unit is available
function isNixUnitAvailable(): boolean {
  try {
    const result = spawnSync('nix-unit', ['--help'], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return result.status === 0
  } catch {
    return false
  }
}

// Helper to get expected reporters with their specific expected values
type TestScenario = 'passing' | 'failing' | 'import'

function getExpectedReporters(
  scenario: TestScenario
): Array<{ name: ReporterName; expected: string }> {
  const baseReporters = [
    {
      name: 'jest' as const,
      expected:
        scenario === 'passing'
          ? 'single-passing.test.js'
          : scenario === 'failing'
            ? 'single-failing.test.js'
            : 'single-import-error.test.js',
    },
    {
      name: 'vitest' as const,
      expected:
        scenario === 'passing'
          ? 'single-passing.test.js'
          : scenario === 'failing'
            ? 'single-failing.test.js'
            : 'single-import-error.test.js',
    },
    {
      name: 'phpunit' as const,
      expected:
        scenario === 'passing'
          ? 'SinglePassingTest.php'
          : scenario === 'failing'
            ? 'SingleFailingTest.php'
            : 'SingleImportErrorTest.php',
    },
    {
      name: 'pytest' as const,
      expected:
        scenario === 'passing'
          ? 'test_single_passing.py'
          : scenario === 'failing'
            ? 'test_single_failing.py'
            : 'test_single_import_error.py',
    },
    {
      name: 'go' as const,
      expected:
        scenario === 'passing'
          ? 'singlePassing'
          : scenario === 'failing'
            ? 'singleFailing'
            : 'missingImport',
    },
    {
      name: 'rust' as const,
      expected:
        scenario === 'passing'
          ? 'single_passing'
          : scenario === 'failing'
            ? 'single_failing'
            : 'compilation',
    },
  ]

  if (isNixUnitAvailable()) {
    baseReporters.push({
      name: 'nix' as const,
      expected: scenario === 'import' ? 'compilation' : 'tests',
    })
  }

  return baseReporters
}

// Helper to get expected test names based on scenario
function getExpectedTestNames(
  scenario: 'passing' | 'failing'
): Array<{ name: ReporterName; expected: string }> {
  const baseReporters = [
    { name: 'jest' as const, expected: 'should add numbers correctly' },
    { name: 'vitest' as const, expected: 'should add numbers correctly' },
    { name: 'phpunit' as const, expected: 'testShouldAddNumbersCorrectly' },
    { name: 'pytest' as const, expected: 'test_should_add_numbers_correctly' },
    {
      name: 'go' as const,
      expected: 'TestCalculator/TestShouldAddNumbersCorrectly',
    },
    {
      name: 'rust' as const,
      expected: 'calculator_tests::should_add_numbers_correctly',
    },
  ]

  if (isNixUnitAvailable()) {
    baseReporters.push({
      name: 'nix' as const,
      expected: scenario === 'passing' ? 'testBasicMath' : 'testBasicMath',
    })
  }

  return baseReporters
}

// Helper for import error test names
function getImportErrorTestNames(): Array<{
  name: ReporterName
  expected: string | undefined
}> {
  const baseReporters = [
    { name: 'jest' as const, expected: 'Module failed to load (Error)' },
    { name: 'vitest' as const, expected: 'single-import-error.test.js' },
    { name: 'phpunit' as const, expected: 'testShouldAddNumbersCorrectly' },
    {
      name: 'pytest' as const,
      expected: 'collection_error_test_single_import_error.py',
    },
    { name: 'go' as const, expected: 'CompilationError' },
    { name: 'rust' as const, expected: 'build' },
  ]

  if (isNixUnitAvailable()) {
    baseReporters.push({ name: 'nix' as const, expected: 'evaluation' })
  }

  return baseReporters
}

// Helper for full test names
function getFullTestNames(
  scenario: 'passing' | 'failing'
): Array<{ name: ReporterName; expected: string }> {
  const baseReporters = [
    {
      name: 'jest' as const,
      expected: 'Calculator should add numbers correctly',
    },
    {
      name: 'vitest' as const,
      expected: 'Calculator > should add numbers correctly',
    },
    {
      name: 'phpunit' as const,
      expected:
        scenario === 'passing'
          ? 'SinglePassingTest::testShouldAddNumbersCorrectly'
          : 'SingleFailingTest::testShouldAddNumbersCorrectly',
    },
    {
      name: 'pytest' as const,
      expected:
        scenario === 'passing'
          ? 'test_single_passing.py::TestCalculator::test_should_add_numbers_correctly'
          : 'test_single_failing.py::TestCalculator::test_should_add_numbers_correctly',
    },
    {
      name: 'go' as const,
      expected:
        scenario === 'passing'
          ? 'singlePassingTestModule/TestCalculator/TestShouldAddNumbersCorrectly'
          : 'singleFailingTestModule/TestCalculator/TestShouldAddNumbersCorrectly',
    },
    {
      name: 'rust' as const,
      expected:
        scenario === 'passing'
          ? 'single_passing::single_passing::calculator_tests::should_add_numbers_correctly'
          : 'single_failing::single_failing::calculator_tests::should_add_numbers_correctly',
    },
  ]

  if (isNixUnitAvailable()) {
    baseReporters.push({
      name: 'nix' as const,
      expected:
        scenario === 'passing' ? 'tests.testBasicMath' : 'tests.testBasicMath',
    })
  }

  return baseReporters
}

// Helper for import error full test names
function getImportErrorFullTestNames(): Array<{
  name: ReporterName
  expected: string | undefined
}> {
  const baseReporters = [
    { name: 'jest' as const, expected: 'Module failed to load (Error)' },
    { name: 'vitest' as const, expected: 'single-import-error.test.js' },
    {
      name: 'phpunit' as const,
      expected: 'SingleImportErrorTest::testShouldAddNumbersCorrectly',
    },
    { name: 'pytest' as const, expected: 'test_single_import_error.py' },
    { name: 'go' as const, expected: 'missingImportModule/CompilationError' },
    { name: 'rust' as const, expected: 'compilation::build' },
  ]

  if (isNixUnitAvailable()) {
    baseReporters.push({
      name: 'nix' as const,
      expected: 'compilation::evaluation',
    })
  }

  return baseReporters
}

// Helper for test reason
function getTestReasons(
  scenario: 'passing' | 'failing' | 'import'
): Array<{ name: ReporterName; expected: string }> {
  const baseReporters = [
    {
      name: 'jest' as const,
      expected: scenario === 'passing' ? 'passed' : 'failed',
    },
    {
      name: 'vitest' as const,
      expected: scenario === 'passing' ? 'passed' : 'failed',
    },
    {
      name: 'phpunit' as const,
      expected: scenario === 'passing' ? 'passed' : 'failed',
    },
    {
      name: 'pytest' as const,
      expected: scenario === 'passing' ? 'passed' : 'failed',
    },
    {
      name: 'go' as const,
      expected: scenario === 'passing' ? 'passed' : 'failed',
    },
    {
      name: 'rust' as const,
      expected: scenario === 'passing' ? 'passed' : 'failed',
    },
  ]

  if (isNixUnitAvailable()) {
    baseReporters.push({
      name: 'nix' as const,
      expected: scenario === 'passing' ? 'passed' : 'failed',
    })
  }

  return baseReporters
}

// Helper for error expected/actual values
function getErrorValues(
  type: 'expected' | 'actual'
): Array<{ name: ReporterName; expected: string | undefined }> {
  const baseReporters = [
    { name: 'jest' as const, expected: type === 'expected' ? '6' : '5' },
    { name: 'vitest' as const, expected: type === 'expected' ? '6' : '5' },
    { name: 'phpunit' as const, expected: undefined },
    { name: 'pytest' as const, expected: undefined },
    { name: 'go' as const, expected: undefined },
    { name: 'rust' as const, expected: type === 'expected' ? '6' : '5' },
  ]

  if (isNixUnitAvailable()) {
    baseReporters.push({ name: 'nix' as const, expected: undefined })
  }

  return baseReporters
}

// Helper for test states
function getTestStates(
  scenario: 'passing' | 'failing' | 'import'
): Array<{ name: ReporterName; expected: string | undefined }> {
  const baseReporters = [
    {
      name: 'jest' as const,
      expected:
        scenario === 'passing'
          ? 'passed'
          : scenario === 'failing'
            ? 'failed'
            : 'failed',
    },
    {
      name: 'vitest' as const,
      expected:
        scenario === 'passing'
          ? 'passed'
          : scenario === 'failing'
            ? 'failed'
            : 'failed',
    },
    {
      name: 'phpunit' as const,
      expected:
        scenario === 'passing'
          ? 'passed'
          : scenario === 'failing'
            ? 'failed'
            : 'failed',
    },
    { name: 'pytest' as const, expected: undefined }, // TODO: Fix
    {
      name: 'go' as const,
      expected:
        scenario === 'passing'
          ? 'passed'
          : scenario === 'failing'
            ? 'failed'
            : 'failed',
    },
    {
      name: 'rust' as const,
      expected:
        scenario === 'passing'
          ? 'passed'
          : scenario === 'failing'
            ? 'failed'
            : 'failed',
    },
  ]

  if (isNixUnitAvailable()) {
    baseReporters.push({
      name: 'nix' as const,
      expected: scenario === 'passing' ? 'passed' : 'failed',
    })
  }

  return baseReporters
}

describe('Reporters', () => {
  const reporterData: ReporterTestData[] = []

  // Run all reporters and collect their output before tests
  beforeAll(async () => {
    const reporters = [
      createJestReporter(),
      createVitestReporter(),
      createPhpunitReporter(),
      createPytestReporter(),
      createGoReporter(),
      createRustReporter(),
    ]

    // Conditionally add Nix reporter if nix-unit is available
    if (isNixUnitAvailable()) {
      reporters.push(createNixReporter())
      console.log('✅ nix-unit detected - including Nix reporter tests')
    } else {
      console.log('⚠️  nix-unit not available - skipping Nix reporter tests')
    }

    // Run all reporters in parallel
    const results = await Promise.all(reporters.map(runAllScenarios))
    reporterData.push(...results)
  }, 30000)

  describe('Module Path Reporting', () => {
    describe('when assertions are passing', () => {
      const reporters = getExpectedReporters('passing')

      it.each(reporters)('$name reports module path', ({ name, expected }) => {
        const moduleIds = extractValues('passingResults', extract.firstModuleId)
        expect(moduleIds[name]).toContain(expected)
      })
    })

    describe('when assertions are failing', () => {
      const reporters = getExpectedReporters('failing')

      it.each(reporters)('$name reports module path', ({ name, expected }) => {
        const moduleIds = extractValues('failingResults', extract.firstModuleId)
        expect(moduleIds[name]).toContain(expected)
      })
    })

    describe('when import errors occur', () => {
      const reporters = getExpectedReporters('import')

      it.each(reporters)('$name reports module path', ({ name, expected }) => {
        const results = extractValues(
          'importErrorResults',
          extract.firstModuleId
        )
        expect(results[name]).toContain(expected)
      })
    })
  })

  describe('Test Name Reporting', () => {
    describe('when assertions are passing', () => {
      const reporters = getExpectedTestNames('passing')

      it.each(reporters)('$name reports test name', ({ name, expected }) => {
        const testNames = extractValues('passingResults', extract.firstTestName)
        expect(testNames[name]).toBe(expected)
      })
    })

    describe('when assertions are failing', () => {
      const reporters = getExpectedTestNames('failing')

      it.each(reporters)('$name reports test name', ({ name, expected }) => {
        const testNames = extractValues('failingResults', extract.firstTestName)
        expect(testNames[name]).toBe(expected)
      })
    })

    describe('when import errors occur', () => {
      const reporters = getImportErrorTestNames()

      it.each(reporters)(
        '$name handles test names for import errors',
        ({ name, expected }) => {
          const results = extractValues(
            'importErrorResults',
            extract.firstTestName
          )
          expect(results[name]).toBe(expected)
        }
      )
    })
  })

  describe('Full Test Name Reporting', () => {
    describe('when assertions are passing', () => {
      const reporters = getFullTestNames('passing')

      it.each(reporters)(
        '$name reports full test name',
        ({ name, expected }) => {
          const fullNames = extractValues(
            'passingResults',
            extract.firstTestFullName
          )
          expect(fullNames[name]).toBe(expected)
        }
      )
    })

    describe('when assertions are failing', () => {
      const reporters = getFullTestNames('failing')

      it.each(reporters)(
        '$name reports full test name',
        ({ name, expected }) => {
          const fullNames = extractValues(
            'failingResults',
            extract.firstTestFullName
          )
          expect(fullNames[name]).toBe(expected)
        }
      )
    })

    describe('when import errors occur', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string | undefined
      }> = [
        { name: 'jest', expected: 'Module failed to load (Error)' },
        { name: 'vitest', expected: 'single-import-error.test.js' },
        {
          name: 'phpunit',
          expected: 'SingleImportErrorTest::testShouldAddNumbersCorrectly',
        },
        { name: 'pytest', expected: 'test_single_import_error.py' },
        { name: 'go', expected: 'missingImportModule/CompilationError' },
        { name: 'rust', expected: 'compilation::build' },
        { name: 'nix', expected: 'compilation::evaluation' },
      ]

      it.each(reporters)(
        '$name handles full test names for import errors',
        ({ name, expected }) => {
          const fullNames = extractValues(
            'importErrorResults',
            extract.firstTestFullName
          )
          expect(fullNames[name]).toContain(expected)
        }
      )
    })
  })

  describe('Test State Reporting', () => {
    describe('when assertions are passing', () => {
      const reporters: ReporterName[] = [
        'jest',
        'vitest',
        'phpunit',
        'pytest',
        'go',
        'rust',
      ]

      it.each(reporters)('%s reports passing state', (reporter) => {
        const testStates = extractValues(
          'passingResults',
          extract.firstTestState
        )
        expect(testStates[reporter]).toBe('passed')
      })
    })

    describe('when assertions are failing', () => {
      const reporters: ReporterName[] = [
        'jest',
        'vitest',
        'phpunit',
        'pytest',
        'go',
        'rust',
      ]

      it.each(reporters)('%s reports failing state', (reporter) => {
        const testStates = extractValues(
          'failingResults',
          extract.firstTestState
        )
        expect(testStates[reporter]).toBe('failed')
      })
    })

    describe('when import errors occur', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string
      }> = [
        { name: 'jest', expected: 'failed' },
        { name: 'vitest', expected: 'failed' },
        { name: 'phpunit', expected: 'failed' },
        { name: 'pytest', expected: 'failed' },
        { name: 'go', expected: 'failed' },
        { name: 'rust', expected: 'failed' },
        { name: 'nix', expected: 'failed' },
      ]

      it.each(reporters)(
        '$name handles test state for import errors',
        ({ name, expected }) => {
          const testStates = extractValues(
            'importErrorResults',
            extract.firstTestState
          )
          expect(testStates[name]).toBe(expected)
        }
      )
    })
  })

  describe('Error Message Reporting', () => {
    describe('when assertions are failing', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string | string[]
      }> = [
        { name: 'jest', expected: ['Expected: 6', 'Received: 5'] },
        {
          name: 'vitest',
          expected: 'expected 5 to be 6 // Object.is equality',
        },
        {
          name: 'phpunit',
          expected: 'Failed asserting that 5 matches expected 6.',
        },
        { name: 'pytest', expected: ['assert 2 + 3 == 6', 'AssertionError'] },
        {
          name: 'go',
          expected: 'single_failing_test.go:10: Expected 6 but got 5',
        },
        {
          name: 'rust',
          expected:
            "thread 'calculator_tests::should_add_numbers_correctly' panicked at src/lib.rs:12:9:",
        },
      ]

      it.each(reporters)(
        '$name reports error messages',
        ({ name, expected }) => {
          const errorMessages = extractValues(
            'failingResults',
            extract.firstErrorMessage
          )

          if (Array.isArray(expected)) {
            expected.forEach((exp) =>
              expect(errorMessages[name]).toContain(exp)
            )
          } else {
            expect(errorMessages[name]).toContain(expected)
          }
        }
      )
    })

    describe('when providing expected values', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string | undefined
      }> = [
        { name: 'jest', expected: '6' },
        { name: 'vitest', expected: '6' },
        { name: 'phpunit', expected: undefined },
        { name: 'pytest', expected: undefined },
        { name: 'go', expected: undefined },
        { name: 'rust', expected: '6' }, // Successfully extracts expected value
        { name: 'nix', expected: undefined },
      ]

      it.each(reporters)(
        '$name provides expected value when available',
        ({ name, expected }) => {
          const errors = extractValues('failingResults', extract.firstError)
          expect(errors[name]?.expected).toBe(expected)
        }
      )
    })

    describe('when providing actual values', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string | undefined
      }> = [
        { name: 'jest', expected: '5' },
        { name: 'vitest', expected: '5' },
        { name: 'phpunit', expected: undefined },
        { name: 'pytest', expected: undefined },
        { name: 'go', expected: undefined },
        { name: 'rust', expected: '5' }, // Successfully extracts actual value
        { name: 'nix', expected: undefined },
      ]

      it.each(reporters)(
        '$name provides actual value when available',
        ({ name, expected }) => {
          const errors = extractValues('failingResults', extract.firstError)
          expect(errors[name]?.actual).toBe(expected)
        }
      )
    })

    describe('when import errors occur', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string[]
      }> = [
        {
          name: 'jest',
          expected: [
            "Cannot find module './non-existent-module' from 'single-import-error.test.js'",
          ],
        },
        {
          name: 'vitest',
          expected: [
            "Cannot find module './non-existent-module'",
            'single-import-error.test.js',
          ],
        },
        { name: 'phpunit', expected: ['Class', 'not found'] },
        {
          name: 'pytest',
          expected: ['ModuleNotFoundError', 'non_existent_module'],
        },
        {
          name: 'go',
          expected: [
            'single_import_error_test.go',
            'no required module provides package',
            'github.com/non-existent/module',
          ],
        },
        {
          name: 'rust',
          expected: ['E0432', 'unresolved import', 'non_existent_module'],
        },
      ]

      it.each(reporters)(
        '$name reports error messages for import errors',
        ({ name, expected }) => {
          const errorMessages = extractValues(
            'importErrorResults',
            extract.firstErrorMessage
          )

          expected.forEach((exp) => expect(errorMessages[name]).toContain(exp))
        }
      )
    })
  })

  describe('Overall Test Run Status', () => {
    describe('when all tests pass', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string | undefined
      }> = [
        { name: 'jest', expected: 'passed' },
        { name: 'vitest', expected: 'passed' },
        { name: 'phpunit', expected: 'passed' },
        { name: 'pytest', expected: undefined }, // TODO: Fix
        { name: 'go', expected: 'passed' },
        { name: 'rust', expected: 'passed' },
        { name: 'nix', expected: 'passed' },
      ]

      it.each(reporters)(
        '$name reports overall status as passed',
        ({ name, expected }) => {
          const reasons = extractValues('passingResults', extract.reason)
          expect(reasons[name]).toBe(expected)
        }
      )
    })

    describe('when any test fails', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string | undefined
      }> = [
        { name: 'jest', expected: 'failed' },
        { name: 'vitest', expected: 'failed' },
        { name: 'phpunit', expected: 'failed' },
        { name: 'pytest', expected: undefined }, // TODO: Fix
        { name: 'go', expected: 'failed' },
        { name: 'rust', expected: 'failed' },
        { name: 'nix', expected: 'failed' },
      ]

      it.each(reporters)(
        '$name reports overall status as failed',
        ({ name, expected }) => {
          const reasons = extractValues('failingResults', extract.reason)
          expect(reasons[name]).toBe(expected)
        }
      )
    })

    describe('when any import fails', () => {
      const reporters: Array<{
        name: ReporterName
        expected: string | undefined
      }> = [
        { name: 'jest', expected: 'failed' },
        { name: 'vitest', expected: 'failed' },
        { name: 'phpunit', expected: 'failed' },
        { name: 'pytest', expected: undefined }, // TODO: Fix
        { name: 'go', expected: 'failed' },
        { name: 'rust', expected: 'failed' },
        { name: 'nix', expected: 'failed' },
      ]

      it.each(reporters)(
        '$name reports overall status as failed',
        ({ name, expected }) => {
          const reasons = extractValues('importErrorResults', extract.reason)
          expect(reasons[name]).toBe(expected)
        }
      )
    })
  })

  // Rust-specific enhancements tests
  describe('Rust-Specific Enhancements', () => {
    describe('compilation error details', () => {
      it('Rust reporter includes error codes', () => {
        const results = extractValues(
          'importErrorResults',
          extract.firstError
        ) as Record<ReporterName, TestError | undefined>
        const rustError = results.rust
        if (rustError?.code) {
          expect(rustError.code).toMatch(/E\d{4}/)
        }
      })

      it('Rust reporter includes file locations', () => {
        const results = extractValues(
          'importErrorResults',
          extract.firstError
        ) as Record<ReporterName, TestError | undefined>
        const rustError = results.rust
        if (rustError?.location) {
          expect(rustError.location).toContain('src/lib.rs')
        }
      })
    })
  })

  // Helper to extract values from all reporters
  function extractValues<T>(
    scenario: 'passingResults' | 'failingResults' | 'importErrorResults',
    extractor: (data: unknown) => T
  ): Record<ReporterName, T | undefined> {
    const [jest, vitest, phpunit, pytest, go, rust] = reporterData
    return {
      jest: safeExtract(jest[scenario], extractor),
      vitest: safeExtract(vitest[scenario], extractor),
      phpunit: safeExtract(phpunit[scenario], extractor),
      pytest: safeExtract(pytest[scenario], extractor),
      go: safeExtract(go[scenario], extractor),
      rust: safeExtract(rust[scenario], extractor),
    }
  }

  // Safely extract data with error handling
  function safeExtract<T>(
    data: unknown,
    extractor: (data: unknown) => T
  ): T | undefined {
    try {
      return extractor(data)
    } catch {
      return undefined
    }
  }

  // Common test data extractors
  const extract = {
    firstModuleId: (data: unknown) =>
      (data as TestResultData).testModules[0].moduleId,
    firstTestName: (data: unknown) =>
      (data as TestResultData).testModules[0].tests[0].name,
    firstTestFullName: (data: unknown) =>
      (data as TestResultData).testModules[0].tests[0].fullName,
    firstTestState: (data: unknown) =>
      (data as TestResultData).testModules[0].tests[0].state,
    firstError: (data: unknown) =>
      (data as TestResultData).testModules[0].tests[0].errors?.[0],
    firstErrorMessage: (data: unknown) =>
      (data as TestResultData).testModules[0].tests[0].errors?.[0].message,
    reason: (data: unknown) => (data as TestResultData).reason,
  }
})

// Helper to run all test scenarios for a reporter
async function runAllScenarios(
  reporter: ReporterConfig
): Promise<ReporterTestData> {
  const [passingResults, failingResults, importErrorResults] =
    await Promise.all([
      runReporter(reporter, 'singlePassing'),
      runReporter(reporter, 'singleFailing'),
      runReporter(reporter, 'singleImportError'),
    ])

  return {
    name: reporter.name,
    passingResults,
    failingResults,
    importErrorResults,
  }
}

// Helper function to run a reporter and get results
async function runReporter(
  reporter: ReporterConfig,
  scenario: keyof TestScenarios
) {
  const tempDir = mkdtempSync(
    join(tmpdir(), `${reporter.name.toLowerCase()}-test-`)
  )

  try {
    // Create storage for reading test results
    const tddConfig = new TDDConfig({ projectRoot: tempDir })
    const storage = new FileStorage(tddConfig)

    // Run the test for the given scenario
    reporter.run(tempDir, scenario)

    // Get saved test data
    const savedData = await storage.getTest()
    return savedData ? JSON.parse(savedData) : null
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
