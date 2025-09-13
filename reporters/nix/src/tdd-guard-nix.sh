#!/usr/bin/env bash
set -euo pipefail

# TDD Guard Nix test reporter - FIXED VERSION
# Handles real nix-unit output format with emoji indicators

# Configuration constants (can be overridden by command line)
MAX_EXECUTION_TIME=300  # 5 minutes
# MAX_MEMORY_MB=1024      # 1GB memory limit (unused for now)
MAX_OUTPUT_LINES=10000  # Prevent output flooding

# Run command with timeout and resource limits
run_with_limits() {
    local cmd=("$@")

    # Use timeout if available (most modern systems)
    if command -v timeout >/dev/null 2>&1; then
        timeout "$MAX_EXECUTION_TIME" "${cmd[@]}"
    elif command -v gtimeout >/dev/null 2>&1; then
        # macOS with coreutils
        gtimeout "$MAX_EXECUTION_TIME" "${cmd[@]}"
    else
        # Fallback without timeout (not ideal but functional)
        "${cmd[@]}"
    fi
}

# Limit output lines to prevent flooding
limit_output() {
    head -n "$MAX_OUTPUT_LINES"
}

# Parse nix-unit output and save to TDD Guard format
parse_and_save_output() {
    local lines=("$@")
    local test_modules=()
    local current_tests=()
    local overall_reason="passed"
    local has_tests=false

    # We'll assume all tests belong to the same module based on the test file
    local module_id="tests"

    # State tracking for error details
    local current_test_name=""
    local current_error_details=""
    local in_error_section=false

    # Parse nix-unit output
    for line in "${lines[@]}"; do
        # Skip empty lines and warnings
        [[ -n "$line" && ! "$line" =~ ^[[:space:]]*$ ]] || continue
        [[ ! "$line" =~ ^warning: ]] || continue

        # Test result lines: ✅ testName or ❌ testName
        if [[ "$line" =~ ^(✅|❌)[[:space:]]+([^[:space:]]+) ]]; then
            # Save any previous error details
            if [[ -n "$current_test_name" && "$in_error_section" == true ]]; then
                local errors=()
                if [[ -n "$current_error_details" ]]; then
                    errors=("$(create_test_error "$current_error_details")")
                fi
                current_tests+=("$(create_test "$current_test_name" "$module_id.$current_test_name" "failed" "${errors[@]}")")
                current_error_details=""
                in_error_section=false
            fi

            local status_emoji="${BASH_REMATCH[1]}"
            local test_name="${BASH_REMATCH[2]}"
            has_tests=true
            current_test_name="$test_name"

            if [[ "$status_emoji" == "✅" ]]; then
                # Passing test - add immediately
                current_tests+=("$(create_test "$test_name" "$module_id.$test_name" "passed")")
                current_test_name=""
            else
                # Failing test - wait for error details
                overall_reason="failed"
                in_error_section=true
            fi

        # Collect error details for failing tests (colored diff output)
        elif [[ "$in_error_section" == true ]]; then
            # Skip color escape sequences and extract meaningful content
            local clean_line
            clean_line="$(printf '%s\n' "$line" | sed 's/\x1b\[[0-9;]*m//g')" # Remove ANSI colors

            if [[ -n "$clean_line" && ! "$clean_line" =~ ^[[:space:]]*$ ]]; then
                if [[ -n "$current_error_details" ]]; then
                    current_error_details="$current_error_details\n$clean_line"
                else
                    current_error_details="$clean_line"
                fi
            fi

        # Summary lines like "🎉 4/4 successful" or "😢 0/3 successful"
        elif [[ "$line" =~ ^(🎉|😢)[[:space:]]+([0-9]+)/([0-9]+)[[:space:]]+successful ]]; then
            local emoji="${BASH_REMATCH[1]}"
            local passed="${BASH_REMATCH[2]}"
            local total="${BASH_REMATCH[3]}"

            if [[ "$emoji" == "😢" || "$passed" != "$total" ]]; then
                overall_reason="failed"
            fi

        # Error lines (syntax errors, evaluation errors)
        elif [[ "$line" =~ error:|Error:|syntax[[:space:]]+error ]]; then
            # This is a compilation/evaluation error
            overall_reason="failed"

            # If we don't have any regular tests, this becomes a compilation error
            if [[ "$has_tests" == false ]]; then
                current_tests+=("$(create_test "evaluation" "compilation.evaluation" "failed" "$(create_test_error "$line")")")
                module_id="compilation"
                has_tests=true
            fi
        fi
    done

    # Handle any remaining failing test
    if [[ -n "$current_test_name" && "$in_error_section" == true ]]; then
        local errors=()
        if [[ -n "$current_error_details" ]]; then
            errors=("$(create_test_error "$current_error_details")")
        else
            errors=("$(create_test_error "Test failed")")
        fi
        current_tests+=("$(create_test "$current_test_name" "$module_id.$current_test_name" "failed" "${errors[@]}")")
    fi

    # If no tests were found but we have output, create an error module
    if [[ "$has_tests" == false && ${#lines[@]} -gt 0 ]]; then
        local error_messages
        error_messages="$(printf '%s\n' "${lines[@]}")"
        current_tests+=("$(create_test "evaluation" "compilation.evaluation" "failed" "$(create_test_error "$error_messages")")")
        module_id="compilation"
        overall_reason="failed"
    fi

    # Create the test module
    if [[ ${#current_tests[@]} -gt 0 ]]; then
        test_modules+=("$(create_test_module "$module_id" "${current_tests[@]}")")
    fi

    # Create final JSON output
    local json_output
    json_output="$(create_test_result "${test_modules[@]}" "$overall_reason")"

    save_test_results "$json_output"
}

# Helper functions to create JSON objects (same as before)
create_test_error() {
    local message="$1"
    jq -n --arg msg "$message" '{
        message: $msg
    }'
}

create_test() {
    local name="$1"
    local full_name="$2"
    local state="$3"
    shift 3
    local errors=("$@")

    local errors_json="[]"
    if [[ ${#errors[@]} -gt 0 ]]; then
        errors_json="$(printf '%s\n' "${errors[@]}" | jq -s '.')"
    fi

    jq -n \
        --arg name "$name" \
        --arg fullName "$full_name" \
        --arg state "$state" \
        --argjson errors "$errors_json" \
        '{
            name: $name,
            fullName: $fullName,
            state: $state
        } + if ($errors | length > 0) then {errors: $errors} else {} end'
}

create_test_module() {
    local module_id="$1"
    shift
    local tests=("$@")

    local tests_json="[]"
    if [[ ${#tests[@]} -gt 0 ]]; then
        tests_json="$(printf '%s\n' "${tests[@]}" | jq -s '.')"
    fi

    jq -n \
        --arg moduleId "$module_id" \
        --argjson tests "$tests_json" \
        '{
            moduleId: $moduleId,
            tests: $tests
        }'
}

create_test_result() {
    local reason="${*: -1}"  # Last argument is reason
    local modules=("${@:1:$#-1}")  # All but last argument are modules

    local modules_json="[]"
    if [[ ${#modules[@]} -gt 0 ]]; then
        modules_json="$(printf '%s\n' "${modules[@]}" | jq -s '.')"
    fi

    jq -n \
        --argjson testModules "$modules_json" \
        --arg reason "$reason" \
        '{
            testModules: $testModules,
            reason: $reason
        }'
}

# Save test results to TDD Guard data directory
save_test_results() {
    local json_output="$1"

    local data_dir="$PROJECT_ROOT/.claude/tdd-guard/data"
    local output_file="$data_dir/test.json"
    local temp_file="$data_dir/test.json.tmp"

    # Create data directory
    mkdir -p "$data_dir"

    # Write to temp file first, then move (atomic operation)
    echo "$json_output" | jq '.' > "$temp_file"
    mv "$temp_file" "$output_file"

    echo "Test results saved to $output_file" >&2
}

# Default values
PROJECT_ROOT=""
PASSTHROUGH=false
# NO_AUTO_PASSTHROUGH=false  # Unused for now
TEST_FILE=""
declare -a TEST_ARGS=()

# Parse command line arguments (simplified for quick fix)
for arg in "$@"; do
    case $arg in
        --project-root=*)
            PROJECT_ROOT="${arg#*=}"
            shift
            ;;
        --project-root)
            shift
            PROJECT_ROOT="$1"
            shift
            ;;
        --passthrough)
            PASSTHROUGH=true
            shift
            ;;
        --test-file=*)
            TEST_FILE="${arg#*=}"
            shift
            ;;
        --timeout=*)
            MAX_EXECUTION_TIME="${arg#*=}"
            shift
            ;;
        --max-output=*)
            MAX_OUTPUT_LINES="${arg#*=}"
            shift
            ;;
        --help)
            echo "tdd-guard-nix - Nix test reporter for TDD Guard validation"
            echo "Usage: tdd-guard-nix --project-root <PATH> [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --passthrough          Read test output from stdin instead of running nix-unit"
            echo "  --test-file <FILE>     Nix test file to run (default: tests.nix or test.nix)"
            echo "  --timeout <SECONDS>    Maximum execution time (default: $MAX_EXECUTION_TIME)"
            echo "  --max-output <LINES>   Maximum output lines (default: $MAX_OUTPUT_LINES)"
            echo "  --help                 Show this help message"
            exit 0
            ;;
        *)
            TEST_ARGS+=("$arg")
            shift
            ;;
    esac
done

# Validate project root
if [[ -z "$PROJECT_ROOT" ]]; then
    echo "Error: --project-root is required" >&2
    echo "Usage: tdd-guard-nix --project-root <PATH> [OPTIONS]" >&2
    echo "Try 'tdd-guard-nix --help' for more information." >&2
    exit 1
fi

if [[ ! "$PROJECT_ROOT" = /* ]]; then
    echo "Error: project-root must be an absolute path, got: $PROJECT_ROOT" >&2
    echo "Example: --project-root \$(pwd) or --project-root /home/user/project" >&2
    exit 1
fi

if [[ ! -d "$PROJECT_ROOT" ]]; then
    echo "Error: project-root directory does not exist: $PROJECT_ROOT" >&2
    echo "Please create the directory or check the path is correct." >&2
    exit 1
fi

# Validate timeout and resource limits
if ! [[ "$MAX_EXECUTION_TIME" =~ ^[0-9]+$ ]] || [[ "$MAX_EXECUTION_TIME" -le 0 ]]; then
    echo "Error: --timeout must be a positive integer (seconds), got: $MAX_EXECUTION_TIME" >&2
    echo "Example: --timeout 300 (for 5 minutes)" >&2
    exit 1
fi

if [[ "$MAX_EXECUTION_TIME" -gt 3600 ]]; then
    echo "Warning: Timeout of ${MAX_EXECUTION_TIME}s is longer than 1 hour" >&2
    echo "Long timeouts may indicate infinite loops or excessive computation." >&2
fi

if ! [[ "$MAX_OUTPUT_LINES" =~ ^[0-9]+$ ]] || [[ "$MAX_OUTPUT_LINES" -le 0 ]]; then
    echo "Error: --max-output must be a positive integer (lines), got: $MAX_OUTPUT_LINES" >&2
    echo "Example: --max-output 10000 (for 10,000 lines)" >&2
    exit 1
fi

# Main execution
if [[ "$PASSTHROUGH" == true ]]; then
    # Process passthrough mode - read from stdin with limits
    output_lines=()
    line_count=0
    while IFS= read -r line && [[ $line_count -lt $MAX_OUTPUT_LINES ]]; do
        echo "$line"
        output_lines+=("$line")
        ((line_count++))
    done

    # Warn if output was truncated
    if [[ $line_count -ge $MAX_OUTPUT_LINES ]]; then
        echo "Warning: Output truncated at $MAX_OUTPUT_LINES lines to prevent memory exhaustion" >&2
        output_lines+=("Warning: Output truncated - too many lines")
    fi

    parse_and_save_output "${output_lines[@]}"
else
    # Find test file
    if [[ -z "$TEST_FILE" ]]; then
        if [[ -f "tests.nix" ]]; then
            TEST_FILE="tests.nix"
        elif [[ -f "test.nix" ]]; then
            TEST_FILE="test.nix"
        else
            echo "Error: No Nix test file found in current directory" >&2
            echo "Searched for: tests.nix, test.nix" >&2
            echo "Solutions:" >&2
            echo "  1. Create a tests.nix file with nix-unit tests" >&2
            echo "  2. Use --test-file <path> to specify a custom location" >&2
            echo "  3. See nix-unit documentation: https://github.com/nix-community/nix-unit" >&2
            exit 1
        fi
    fi

    # Run nix-unit with timeout and resource limits
    output_lines=()
    if ! mapfile -t output_lines < <(run_with_limits nix-unit "$TEST_FILE" "${TEST_ARGS[@]}" 2>&1 | limit_output); then
        # Handle timeout or execution failure
        exit_code=$?
        if [[ $exit_code -eq 124 || $exit_code -eq 143 ]]; then
            # Timeout occurred (124 for timeout, 143 for SIGTERM)
            echo "Error: nix-unit execution timed out after ${MAX_EXECUTION_TIME} seconds" >&2
            echo "This may indicate:" >&2
            echo "  • Infinite recursion in Nix expressions" >&2
            echo "  • Very large or complex computations" >&2
            echo "  • Stuck evaluation or I/O operations" >&2
            echo "Solutions:" >&2
            echo "  • Increase timeout: --timeout $((MAX_EXECUTION_TIME * 2))" >&2
            echo "  • Review test expressions for performance issues" >&2
            echo "  • Check for infinite recursion in your Nix code" >&2
            output_lines+=("Error: Test execution timed out after ${MAX_EXECUTION_TIME} seconds")
            output_lines+=("This may indicate infinite recursion or excessive computation")
        else
            # Other execution failure, but we still want to process any output
            true
        fi
    fi

    # Echo output for user
    printf '%s\n' "${output_lines[@]}"

    # Process through our parser
    parse_and_save_output "${output_lines[@]}"
fi