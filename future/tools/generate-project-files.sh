#!/bin/bash

# Script to generate project-outline.md and project-files.txt for Grok Workspaces
# Run from future/scripts/ folder, outputs files to future/ (development root)
# Usage: ./scripts/generate-project-files.sh [project_name] [extensions] [exclude_dirs]

# Configuration with defaults
SCRIPT_DIR="$(realpath "$(dirname "$0")")" # Absolute path to future/scripts/
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/..")" # Navigate to future/
PROJECT_NAME="${1:-$(basename "$(dirname "$PROJECT_ROOT")")}" # Use arg or parent directory (acoustsee)
INCLUDE_EXTENSIONS="${2:-*.js|*.md|*.json|*.html|*.css}" # Default extensions
EXCLUDE_DIRS="${3:-node_modules|dist|scripts|past|present}" # Exclude scripts, past, present
OUTPUT_DIR="$PROJECT_ROOT"
PROJECT_OUTLINE="$OUTPUT_DIR/project-outline.md"
PROJECT_FILES="$OUTPUT_DIR/project-files.txt"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %z') # e.g., 2025-07-11 13:00:00 -0300

# Debug: Print configuration
echo "Debug: SCRIPT_DIR=$SCRIPT_DIR"
echo "Debug: PROJECT_ROOT=$PROJECT_ROOT"
echo "Debug: PROJECT_NAME=$PROJECT_NAME"
echo "Debug: INCLUDE_EXTENSIONS=$INCLUDE_EXTENSIONS"
echo "Debug: EXCLUDE_DIRS=$EXCLUDE_DIRS"
echo "Debug: OUTPUT_DIR=$OUTPUT_DIR"
echo "Debug: TIMESTAMP=$TIMESTAMP"

# Verify PROJECT_ROOT exists
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "Error: PROJECT_ROOT ($PROJECT_ROOT) is not a valid directory."
    exit 1
fi

# Check if tree and jq are installed
command -v tree >/dev/null 2>&1 || { echo "Error: tree is not installed. Run 'sudo apt-get install tree'"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Warning: jq is not installed. Using directory name for PROJECT_NAME"; }

# Try to get project name from package.json in PROJECT_ROOT or parent
if [ -f "$PROJECT_ROOT/package.json" ] && command -v jq >/dev/null 2>&1; then
    PROJECT_NAME=$(jq -r '.name // "'"$PROJECT_NAME"'"' "$PROJECT_ROOT/package.json")
elif [ -f "$PROJECT_ROOT/../package.json" ] && command -v jq >/dev/null 2>&1; then
    PROJECT_NAME=$(jq -r '.name // "'"$PROJECT_NAME"'"' "$PROJECT_ROOT/../package.json")
fi
echo "Debug: Final PROJECT_NAME=$PROJECT_NAME"

# Step 1: Generate project-outline.md with tree structure
cd "$PROJECT_ROOT" || { echo "Error: Cannot change to $PROJECT_ROOT"; exit 1; }
cat << EOF > "$PROJECT_OUTLINE"
<!--- Generated on: $TIMESTAMP -->
# $PROJECT_NAME Project Structure

Due to Grok Workspaces' 10-file limit, project files are consolidated in \`$PROJECT_FILES\`. This covers only the \`future/\` directory (development area). Refer to the tree below for the logical organization and use prefixes (e.g., \`web-\`, \`ui-\`) when referencing files.

## Project Tree
\`\`\`
EOF

# Debug: Print tree command
echo "Debug: Running tree -f -a -I '$EXCLUDE_DIRS' --noreport"
# Generate tree, excluding unwanted directories
tree -f -a -I "$EXCLUDE_DIRS" --noreport >> "$PROJECT_OUTLINE" 2>/dev/null || echo "Warning: tree command failed, tree may be empty."

cat << EOF >> "$PROJECT_OUTLINE"
\`\`\`


## Reusable Modules
- \`web/utils.js\`: General utilities.
- \`web/processing-utils.js\`: Shared processing logic.
- \`web/frame-processor.js\`: Grid features for computer vision.
- \`web/audio-processor.js\`: Synthesis engine logic for audio processing.
- \`web/context.js\`: Shared context utilities.
- Check \`$PROJECT_FILES\` for these modules to avoid redundancy.

## File Access
- All files are in \`$PROJECT_FILES\`. Use paths like \`web/frame-processor.js\` when prompting Grok.
- Example: "Extract \`web/frame-processor.js\` from \`$PROJECT_FILES\`."

## Dynamic Loading
- Add grid types to \`frame-processor.js\` (e.g., \`import('./synthesis-methods/grids/circle-of-fifths.js')\`).
- Add synthesis engines to \`audio-processor.js\` (e.g., \`import('./synthesis-methods/engines/fm-synthesis.js')\`).
- Configuration in \`web/synthesis-methods/grids/availableGrids.json\` and \`web/synthesis-methods/engines/availableEngines.json\`.

## Contribution Guidelines
See the workspace’s custom instructions for ES modules, top-down flow, avoiding redundancy, and proposing improvements.

## Notes
- Run \`future/scripts/generate-project-files.sh\` in Codespaces to update this file and \`$PROJECT_FILES\`.
- Only the \`future/\` directory is included, as it’s the development focus.
EOF

# Step 2: Generate project-files.txt by concatenating source files
> "$PROJECT_FILES" # Clear the output file
echo "// Generated on: $TIMESTAMP" >> "$PROJECT_FILES"
echo "" >> "$PROJECT_FILES"
# Convert INCLUDE_EXTENSIONS to find-compatible syntax
FIND_NAMES=""
IFS='|' read -ra EXT_ARRAY <<< "$INCLUDE_EXTENSIONS"
for ext in "${EXT_ARRAY[@]}"; do
    if [ -n "$FIND_NAMES" ]; then
        FIND_NAMES="$FIND_NAMES -o -name '$ext'"
    else
        FIND_NAMES="-name '$ext'"
    fi
done

# Debug: Print find command
echo "Debug: Running find . -type f \( $FIND_NAMES \) -not -path './$EXCLUDE_DIRS/*'"
# Run find command
eval "find . -type f \( $FIND_NAMES \) -not -path './$EXCLUDE_DIRS/*'" | while read -r file; do
    # Get relative path and remove leading ./
    relative_path="${file#./}"
    # Add delimiter and file content
    echo "// File: $relative_path" >> "$PROJECT_FILES"
    cat "$file" >> "$PROJECT_FILES" 2>/dev/null || echo "Warning: Could not read $file"
    echo -e "\n" >> "$PROJECT_FILES"
done

# Step 3: Check if files are empty
if [ ! -s "$PROJECT_OUTLINE" ]; then
    echo "Warning: $PROJECT_OUTLINE is empty. Check if tree command found files."
fi
if [ ! -s "$PROJECT_FILES" ] || [ "$(wc -l < "$PROJECT_FILES")" -le 2 ]; then
    echo "Warning: $PROJECT_FILES is empty or contains only timestamp. Check if files match extensions: $INCLUDE_EXTENSIONS"
    echo "Debug: List files in $PROJECT_ROOT:"
    ls -R "$PROJECT_ROOT"
fi

# Step 4: Print completion message
echo "Generated $PROJECT_OUTLINE and $PROJECT_FILES"
echo "Please review $PROJECT_OUTLINE and verify the tree and module details."
echo "Upload both files to Grok Workspaces."