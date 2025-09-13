import { spawnSync, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { ReporterConfig, TestScenarios } from '../types'
import { copyTestArtifacts } from './helpers'

export function createNixReporter(): ReporterConfig {
  const artifactDir = 'nix'
  const testScenarios = {
    singlePassing: 'passing',
    singleFailing: 'failing',
    singleImportError: 'import',
  }

  return {
    name: 'NixReporter',
    testScenarios,
    run: (tempDir, scenario: keyof TestScenarios) => {
      // Copy the test module directory to temp
      copyTestArtifacts(artifactDir, testScenarios, scenario, tempDir)

      const reporterPath = join(__dirname, '../../nix')

      // Check if nix-unit is available
      const nixUnitCheck = spawnSync('nix-unit', ['--help'], {
        stdio: 'pipe',
        encoding: 'utf8',
      })

      if (nixUnitCheck.status !== 0) {
        throw new Error(
          'nix-unit not available. Install with: nix profile install nixpkgs#nix-unit'
        )
      }

      // Check if our Nix reporter is built
      const reporterBuildCheck = spawnSync('nix', ['build', '--no-link'], {
        cwd: reporterPath,
        stdio: 'pipe',
        encoding: 'utf8',
      })

      if (reporterBuildCheck.status !== 0) {
        throw new Error(
          `Failed to build Nix reporter: ${reporterBuildCheck.stderr}`
        )
      }

      // Get the built reporter path
      const reporterBinary = spawnSync(
        'nix',
        ['eval', '--raw', '.#default.outPath'],
        {
          cwd: reporterPath,
          stdio: 'pipe',
          encoding: 'utf8',
        }
      )

      if (reporterBinary.status !== 0) {
        throw new Error(
          `Failed to get reporter binary path: ${reporterBinary.stderr}`
        )
      }

      const binaryPath = join(
        reporterBinary.stdout.trim(),
        'bin',
        'tdd-guard-nix'
      )

      if (!existsSync(binaryPath)) {
        throw new Error(`Reporter binary not found at: ${binaryPath}`)
      }

      // Run nix-unit on the test file
      const nixUnitResult = spawnSync('nix-unit', ['tests.nix'], {
        cwd: tempDir,
        stdio: 'pipe',
        encoding: 'utf8',
      })

      // Combine stdout and stderr for processing
      const testOutput =
        (nixUnitResult.stdout || '') + (nixUnitResult.stderr || '')

      // Pipe test output to our reporter using passthrough mode
      try {
        execFileSync(binaryPath, ['--project-root', tempDir, '--passthrough'], {
          cwd: tempDir,
          input: testOutput,
          stdio: 'pipe',
          encoding: 'utf8',
        })
      } catch (error) {
        // Return the error for test verification
        return error as ReturnType<typeof spawnSync>
      }

      return nixUnitResult
    },
  }
}
