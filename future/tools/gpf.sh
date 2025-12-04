#!/bin/bash
# filepath: /workspaces/acoustsee/future/tools/gpf.sh

OUTPUT_FILE="../project-files.txt"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %z')

echo "// Generated on: $TIMESTAMP" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

find ../web -type f ! -path "../web/dist/*" | while read -r file; do
  echo "// File: ${file#../}" >> "$OUTPUT_FILE"
  cat "$file" >> "$OUTPUT_FILE"
  echo -e "\n" >> "$OUTPUT_FILE"
done

echo "Generated $OUTPUT_FILE"