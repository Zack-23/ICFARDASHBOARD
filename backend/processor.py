# This file purpose is to clean and combined all files into one combined version

import pandas as pd
def build_column_names(raw_header: list[str]) -> list[str]:
    column_names = []

    for i, token in enumerate(raw_header):
        if i == 0:
            column_names.append("raw_date")
        elif i == 1:
            column_names.append("raw_time")
        else:
            column_names.append(token)

    return column_names

def find_header_tokens(content: str) -> list:
    """Finds the header line and returns its raw, unsplit tokens."""
    for line in content.splitlines():
        tokens = line.split()
        for token in tokens:
            if "date" in token.lower():
                return tokens
    return []


def parse_files_to_rows(content: str, column_names: list[str]) -> list[dict]:
    rows = []
    for line in content.splitlines():
        tokens = line.split()

        if len(tokens) != len(column_names):
            continue  # skips blanks, noise, header line, malformed rows
        if not tokens[0][0].isdigit():
            continue  # skips header line itself

        row = dict(zip(column_names, tokens))
        rows.append(row)

    return rows

def combine_group_files(file_contents: list[str], raw_header) -> pd.DataFrame:
    """
        Takes raw text content from multiple files (already confirmed by
        validator to share the same header structure), and returns one
        clean, combined, date-sorted DataFrame.
        """
    column_names = build_column_names(raw_header)
    all_rows = []

    for content in file_contents:
        all_rows.extend(parse_files_to_rows(content, column_names))

    # BUGFIX: if none of the files produced any valid data rows (e.g. all
    # files were empty, or every row failed the column-count/leading-digit
    # checks), pd.DataFrame(all_rows) would come back with NO columns at
    # all, and the df["raw_date"] access below would raise a KeyError
    # instead of a clean, catchable "no data" result. Return an empty but
    # correctly-shaped frame instead so callers (app.py) can check
    # `.empty` and respond with a normal 4xx instead of a 500.
    if not all_rows:
        empty_cols = [c for c in column_names if c not in ("raw_date", "raw_time")]
        return pd.DataFrame(columns=["datetime"] + empty_cols)

    df = pd.DataFrame(all_rows)

    columns_drop = ["Date", "Time", "Std_Time", "*", "#"]

    for char in columns_drop:
        if char in df.columns:
            df = df.drop(columns=[char])

    # Combine raw_date + raw_time into one real datetime column
    df["datetime"] = pd.to_datetime(df["raw_date"] + " " + df["raw_time"], errors="coerce")
    df = df.drop(columns=["raw_date", "raw_time"])  # now redundant, folded into datetime
    df = df.dropna(subset=["datetime"])
    df = df.sort_values("datetime").reset_index(drop=True)

    return df