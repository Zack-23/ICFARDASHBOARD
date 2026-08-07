# this function handles the file structure and ensuring each columns are same
# we are comparing and analysing files with same structure.
from collections import Counter
# This function handles the dimension of cols.
# BUGFIX: this used to do `line.split()` on the WHOLE FILE's text (the
# caller passes full multi-line content here, not a single line, despite
# the parameter name) -- with no line-splitting first, that counted
# every token across every row combined, producing a number unique to
# however many rows a file happened to have rather than its actual
# column count. Two headerless files with the exact same real structure
# would almost never match, since they rarely have the same row count.
# Now it counts columns per line and takes the most common count across
# the file -- robust against the odd near-blank/heartbeat line mixed in
# (e.g. a timestamp-only row with no reading attached).

def count_columns(line: str) -> int:
    counts = Counter(
        len(row.split())
        for row in line.splitlines()
        if row.split()
    )
    if not counts:
        return 0
    return counts.most_common(1)[0][0]



# This function hanndles reading files and looking for headers and returning
# a dictionary with file name and its headers.
def extract_header(content: str) -> dict:
        for line in content.splitlines():  # looking through each line for the header
            columns = line.split()
            columns_header = []

            for col in columns:
                if col:
                    first_character = col[0]  # FIXED: Changed 'column' to 'col'
                    if first_character.isalpha():
                        columns_header.append(col)  # FIXED: Append the whole word 'col', not just the first character

            has_date = False
            for word in columns_header:  # Renamed 'char' to 'word' for clarity, as it now holds whole words
                lower_word = word.lower()

                if "date" in lower_word:
                    has_date = True
                    break

            if has_date:
                return {
                    "filtered": columns_header,  # existing behavior — used for grouping
                    "raw": columns  # NEW — full line, positions intact
                }

        # BUGFIX: this used to be keyed "unfiltered", but group_uploaded_files()
        # below always reads header_result["filtered"] -- for any file with no
        # date header, that raised a KeyError and crashed the whole /upload
        # request. Keying it "filtered" (still empty) makes the no-header path
        # actually reachable, which is what group_headerless_files() expects.
        return {"filtered": [], "raw": []}

# this function ensures all headers appear same so no extra whitespaces.
def normalize_headers(headers: list) -> tuple:
    cleaned_headers = []
    for header in headers:
        cleaned_headers.append(header.strip().lower())
    return tuple(cleaned_headers)

# This function will store all files with the header so keys will be
# tuple of heaaders and value will be list of files that share that header
async def group_uploaded_files(files: list) -> dict:
    group_map = {}
    no_header_files = []
    for file in files:
        content = await file.read()
        text = content.decode("utf-8", errors="ignore")

        header_result = extract_header(text)
        if not header_result["filtered"]:
            no_header_files.append((file.filename, text))
            continue

        header_tuple = normalize_headers(header_result["filtered"])

        if header_tuple not in group_map:
            group_map[header_tuple] = {
                "headers": list(header_tuple),
                "display_headers": header_result["filtered"],
                "raw_header": header_result["raw"],   # NEW — this is what processor.py needs
                "files": []
            }

        group_map[header_tuple]["files"].append(file.filename)

    groups = list(group_map.values())
    headerless_buckets = group_headerless_files(no_header_files)

    return {
        "group": groups,
        "headerless_buckets": headerless_buckets,
        "total_files": len(files)
    }


def group_headerless_files(no_header_files: list) -> dict:
    """
        Groups headerless files by column count, since there's no header
        to group by structurally. Expects no_header_files as a list of
        (filename, content) pairs.

        Returns: {column_count: [filenames]}
        """
    buckets = {}

    for filename, content in no_header_files:
        col_count = count_columns(content)

        if col_count == 0:
            continue  # empty/unreadable file, skip

        if col_count not in buckets:
            buckets[col_count] = []
        buckets[col_count].append(filename)

    return buckets