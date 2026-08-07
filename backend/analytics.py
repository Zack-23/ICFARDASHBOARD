import re
import pandas as pd

# This file is panda data processing for sensor/time series data.

# function below cleans the panda table by converting columns into numbers and
# non numeric values to Nan.
def convert_columns(df: pd.DataFrame, exclude: list[str]| None = None) -> pd.DataFrame:
        # This function purpose is to convert any row with non_numerical value to Nan.
        # and ignore cols included in exclude as we do not need to convert them.
        # we expect df to be pandas data frame.

        # if no argument has been passed in to ignore which cols by default we will ignore datetime
        if exclude is None:
            # we exclude datetime as default as we do need to convert it into numerical value
            exclude = ["datetime"]

        # make a copy instead of modifying original
        result = df.copy()

        # this code below comverts the col if not excluded.
        # it converts each value to numerical value, and if a value happens to be non numerical'
        # it becomes Nan.
        for cols in result.columns:
            if cols not in exclude:
                result[cols] = pd.to_numeric(result[cols], errors='coerce')

        return result


# This function returns all numerical columns.
def get_available_columns(df:pd.DataFrame) -> list[str]:
       # returns all cols
       return df.select_dtypes(include = "number").columns.tolist()

# This function purpose is to return rows with nan column values.
def get_invalid_rows(df: pd.DataFrame, columns: list[str] | None = None) -> pd.DataFrame:
    # returns rows containing Nan in the selected columns.

    # This function allows us to indentify bad rows
    target_cols = []
    if columns is None:
        # if no specific cols were passed in we check all numerical cols and check them.
        target_cols = get_available_columns(df)
    else:
        target_cols = columns # otherwise we focus on the mentioned cols.

    # if there are no cols to check
    # return empty df
    if len(target_cols) == 0:
        empty_df = df.iloc[0:0]
        return empty_df

    selected_cols = df[target_cols]
    # check every value in those cols
    missing_values = selected_cols.isna() # This checks if each value is Nan or nor

    # Check each row.

    # A row becomes True if at least one selected column contains NaN.
    invalid_row_mask = missing_values.any(axis=1)

    # Use the True/False mask to select only invalid rows.
    invalid_rows = df[invalid_row_mask]

    return invalid_rows


def single_series(df:pd.DataFrame, columns: str) -> pd.DataFrame:
    # This function returns the requested columns.

    # if column requested  that does not exist
    # we return empty column so crash is avoided.
    if columns not in df.columns:
        return pd.DataFrame(columns = ["datetime", columns])

    # this allows us to pick specific cols and drop any row that has Nan value
    # and we also sort datetime.
    result = df[["datetime", columns]].dropna(subset=[columns])
    return result.sort_values("datetime").reset_index(drop=True)

def overlay_series(df:pd.DataFrame, cols_a: str, cols_b: str) -> pd.DataFrame:
    # Function purpose is to return the two cols and their values user is interested from the pandas.
    selected_columns = []

    # check if selected columns are in the panda table.
    if cols_a in df.columns:
        selected_columns.append(cols_a)
    if cols_b in df.columns:
        selected_columns.append(cols_b)
    # if selected columns are not found return empty column
    if len(selected_columns) == 0:
        empty_result = pd.DataFrame(columns = ["datetime", cols_a])
        return empty_result

    columns_to_keep = ["datetime"] + selected_columns
    result = df[columns_to_keep]
    # to decide rows to remove we check the selected columns
    # and we only remove a row if both columns have Nan value.
    result = result.dropna(subset=selected_columns, how="all")

    # sort the value
    result = result.sort_values(by = "datetime")
    result = result.reset_index(drop=True)

    return result

# This function takes panda series columns and returns meaningful statistics.
def stats_row(series: pd.Series) -> dict:

   # This function calculates the summary statistics for the cols.
   # drop missing values such as Nan.
    s = series.dropna()
   # after dropping if no real values exist we return None.
    if s.empty:
        return {"mean": None, "median": None, "min": None, "max": None, "std": None, "q1": None, "q3": None}
    standard_deviation = 0
   # otherwise provide real statistics returned in dictionary
    if len(s) > 1:
        standard_deviation = s.std(ddof=1)
    else:
        standard_deviation = 0.0
    return {
        "mean": s.mean(),
        "median": s.median(),
        "min": s.min(),
        "max": s.max(),
        "std": standard_deviation,
        # NEW -- quartiles, so the frontend can draw an actual box-and-whisker
        # plot (min/Q1/median/Q3/max) instead of just a bar of the mean.
        "q1": s.quantile(0.25),
        "q3": s.quantile(0.75),
    }

def summary_stats(df: pd.DataFrame, columns : list[str]) -> dict:

    # this function calculates the summary statisics for the chosen columns.
    # if columns have not been specified we grab all of them
    target_cols = []

    if columns is None:
        target_cols = get_available_columns(df)
    else:
        target_cols = columns

    summary = {}

    for column in target_cols:

        # process the column if its in the actual pandas table.
        if column in df.columns:
            series = df[column]
            # calculate its mean, median, and summary statistics.
            column_statistics = stats_row(series)
            summary[column] = column_statistics

    return summary


# ---------------------------------------------------------------------------
# NEW -- column "family" grouping. A family is every column that represents
# the same measurement type across multiple probes (T01..T08 are all
# "temperature", VWC1..VWC4 are all "soil moisture", Teros1_mV..Teros4_mV
# are all "teros raw mV"). The rule is generic on purpose: strip the digit
# run out of a column name, and whatever's left (prefix + suffix) is its
# family key -- this works for ANY group's arbitrary sensor set, since
# different saved groups can have completely different headers.
# ---------------------------------------------------------------------------

# This pattern will help us group similar columns.
# before the number will be considered prefix,
# after the numbers it suffix. we will know similar
# groups by identifying if prefix and suffix are same.
FAMILY_PATTERN = re.compile(r"^(\D*)(\d+)(\D*)$")

def column_family_key(column: str) -> str:
    """Returns a column's family key -- its name with the digit run (the
    probe index) removed. A column with no digits at all (e.g. VWC_Range)
    has no siblings, so it's treated as its own one-member family."""
    match = FAMILY_PATTERN.match(column)
    if not match:
        return column
    prefix, _index, suffix = match.groups()
    return prefix + suffix

def get_column_family(columns: list[str], selected_column: str) -> list[str]:
        """Given the full list of available columns and one column the user
        picked as a representative (e.g. 'T01'), returns every column that
        belongs to the same family (e.g. all of T01..T08), in their original
        order. Selecting a family member is a stand-in for selecting the
        whole family -- the frontend never graphs just the one column picked."""

        if selected_column not in columns:
            return []
        key = column_family_key(selected_column)
        return [c for c in columns if column_family_key(c) == key]


def get_available_families(columns: list[str]) -> dict[str, list[str]]:
    """Groups every column into its family. Powers dropdowns that should
    only show one representative per family, not every individual column."""
    families = {}
    for column in columns:

        key = column_family_key(column)
        if key not in families:
            families[key] = []

        families[key].append(column)

    return families


def family_series(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Returns datetime + every column in a family, dropping rows where
    ALL of that family's columns are missing. This generalizes
    single_series (1 column) and overlay_series (2 named columns) to an
    arbitrary-size family -- used by the Individual Graph."""
    present = [c for c in columns if c in df.columns]
    if not present:
        return pd.DataFrame(columns=["datetime"])
    result = df[["datetime"] + present].dropna(subset=present, how="all")
    return result.sort_values("datetime").reset_index(drop=True)


def overlay_families(df: pd.DataFrame, family_a_columns: list[str], family_b_columns: list[str]) -> pd.DataFrame:
    """Returns datetime + every column from BOTH families, for a dual-axis
    overlay chart (family_a on one axis, family_b on the other) -- e.g.
    comparing the whole soil-moisture family against the whole
    temperature family, rather than just two single columns."""
    all_cols = [c for c in family_a_columns + family_b_columns if c in df.columns]
    if not all_cols:
        return pd.DataFrame(columns=["datetime"])
    result = df[["datetime"] + all_cols].dropna(subset=all_cols, how="all")
    return result.sort_values("datetime").reset_index(drop=True)