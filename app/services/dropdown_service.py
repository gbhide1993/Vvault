def detect_dropdown_columns(df):
    dropdown_cols = {}

    for col in df.columns:
        unique_vals = df[col].dropna().unique()

        # small distinct values = dropdown
        if 2 <= len(unique_vals) <= 10:
            values = [str(v).strip() for v in unique_vals]

            # ensure values are short (avoid paragraphs)
            if all(len(v) < 20 for v in values):
                dropdown_cols[col] = values

    return dropdown_cols


def map_answer_to_option(answer, options):
    """
    Map generated answer to closest dropdown option
    """

    answer_lower = answer.lower()

    for opt in options:
        opt_lower = opt.lower()

        if opt_lower in answer_lower:
            return opt

    # fallback simple logic
    if "yes" in answer_lower:
        return "Yes"
    if "no" in answer_lower:
        return "No"

    return options[0] if options else answer