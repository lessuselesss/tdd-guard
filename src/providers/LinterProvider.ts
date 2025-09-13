import { Linter } from '../linters/Linter'
import { Config } from '../config/Config'
import { ESLint } from '../linters/eslint/ESLint'
import { GolangciLint } from '../linters/golangci/GolangciLint'
import { Statix } from '../linters/statix/Statix'
import { NixfTidy } from '../linters/nixf/NixfTidy'

export class LinterProvider {
  getLinter(config?: Config): Linter | null {
    const actualConfig = config ?? new Config()

    switch (actualConfig.linterType) {
      case 'eslint':
        return new ESLint()
      case 'golangci-lint':
        return new GolangciLint()
      case 'statix':
        return new Statix()
      case 'nixf-tidy':
        return new NixfTidy()
      case undefined:
      default:
        return null
    }
  }
}
