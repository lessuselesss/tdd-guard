#!/usr/bin/env bash
set -euo pipefail

# TDD Guard Nix test reporter - FIXED VERSION
# Handles real nix-unit output format with emoji indicators

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
            clean_line="$(echo "$line" | sed 's/\x1b\[[0-9;]*m//g')" # Remove ANSI colors

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
    local project_root="${2:-/tmp/test}"

    local data_dir="$project_root/.claude/tdd-guard/data"
    local output_file="$data_dir/test.json"
    local temp_file="$data_dir/test.json.tmp"

    # Create data directory
    mkdir -p "$data_dir"

    # Write to temp file first, then move (atomic operation)
    echo "$json_output" | jq '.' > "$temp_file"
    mv "$temp_file" "$output_file"

    echo "Test results saved to $output_file" >&2
}

# Test the parser with the real nix-unit output
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Test with real nix-unit output
    echo "Testing parser with real nix-unit output..."

    # Test passing
    echo "=== Testing Passing ==="
    passing_output=(
        "✅ testBasicMath"
        "✅ testBooleanLogic"
        "✅ testListLength"
        "✅ testStringConcatenation"
        ""
        "🎉 4/4 successful"
        "warning: unknown setting 'allowed-users'"
    )
    parse_and_save_output "${passing_output[@]}"
    echo "Passing result:"
    jq '.' /tmp/test/.claude/tdd-guard/data/test.json

    # Test failing
    echo -e "\n=== Testing Failing ==="
    failing_output=(
        "❌ testBasicMath"
        "/tmp/nix-123/expected.nix --- Nix"
        "1 5                           1 6"
        ""
        "❌ testStringConcatenation"
        "/tmp/nix-456/expected.nix --- Nix"
        '1 "helloworld"                1 "hello world"'
        ""
        "😢 0/2 successful"
        "error: Tests failed"
    )
    parse_and_save_output "${failing_output[@]}"
    echo "Failing result:"
    jq '.' /tmp/test/.claude/tdd-guard/data/test.json

    # Test evaluation error
    echo -e "\n=== Testing Evaluation Error ==="
    error_output=(
        "error: syntax error, unexpected IN_KW"
        "at /path/to/tests.nix:8:20:"
        "    7|   testWithBadSyntax = {"
        "    8|     expr = let x = in x;"
        "     |                    ^"
    )
    parse_and_save_output "${error_output[@]}"
    echo "Error result:"
    jq '.' /tmp/test/.claude/tdd-guard/data/test.json
fi