import pandas as pd

def is_valid_sheet(sheet_name, df):

    # ❌ Rule 1: Skip obvious non-question sheets
    sheet_name_lower = sheet_name.lower()

    if any(word in sheet_name_lower for word in [
        "cover", "intro", "instruction", "readme", "summary"
    ]):
        return False

    if any(word in sheet_name_lower for word in [
        "value", "dropdown", "list", "lookup"
    ]):
        return False

    if df.empty:
        return False

    # ✅ Rule 2: Check column names
    col_names = " ".join([str(c).lower() for c in df.columns])

    if any(keyword in col_names for keyword in [
        "question", "control", "requirement", "description"
    ]):
        return True

    # ✅ Rule 3: Strong content check (strict)
    sample_values = df.head(10).values.flatten()

    question_like_count = 0

    for val in sample_values:
        val = str(val).lower().strip()

        if len(val) < 10:
            continue

        if any(val.startswith(word) for word in [
            "do ", "does ", "is ", "are ", "can ", "should ",
            "what ", "how ", "whether ",
            "describe", "provide", "explain",
            "ensure", "maintain", "implement"
        ]):
            question_like_count += 1

    # 👉 Require at least 2 real questions
    if question_like_count >= 2:
        return True

    return False

def find_question_column(df):

    # ✅ Step 1: Try header-based detection
    for col in df.columns:
        col_lower = str(col).lower().strip()

        if any(keyword in col_lower for keyword in [
            "question", "control", "requirement", "description"
        ]):
            return col

    # 🔥 Step 2: Content-based detection (NEW)

    best_col = None
    best_score = 0

    for col in df.columns:
        values = df[col].dropna().astype(str).head(20)

        score = 0

        for val in values:
            val_lower = val.lower().strip()

            if len(val_lower) < 10:
                continue

            if any(val_lower.startswith(word) for word in [
                "do ", "does ", "is ", "are ", "can ",
                "should ", "what ", "how ", "whether "
            ]):
                score += 1

        if score > best_score:
            best_score = score
            best_col = col

    # 👉 minimum confidence threshold
    if best_score >= 2:
        return best_col

    return None

def is_valid_question(text: str):
    if not text:
        return False

    text = str(text).strip().lower()

    # ❌ skip junk
    if text in ["nan", "none", "", "-"]:
        return False

    # ❌ skip very short text
    if len(text) < 8:
        return False

    # ❌ skip section headers (common patterns)
    if text.isupper() and len(text.split()) < 5:
        return False

    # ❌ skip numeric-only rows
    if text.replace(".", "").isdigit():
        return False

    # ✅ allow real questions
    if any(word in text for word in [
        "do", "does", "is", "are", "can", "should",
        "what", "how", "whether"
    ]):
        return True

    # fallback: long descriptive sentence
    if len(text.split()) > 5:
        return True

    return False

def parse_excel(file):

    excel_data = pd.read_excel(file, sheet_name=None)

    sheet_data = {}   # 🔥 store per-sheet dataframe
    all_rows = []

    global_index = 0

    for sheet_name, df in excel_data.items():

        if not is_valid_sheet(sheet_name, df):
            print(f"Skipping sheet: {sheet_name}")
            continue

        question_col = find_question_column(df)

        if not question_col:
            # 🔥 fallback: use first column
            question_col = df.columns[0]

        df = df.copy()
        df["Answer"] = ""

        sheet_rows = []

        for i, row in df.iterrows():
            question = str(row[question_col]).strip()

            if not is_valid_question(question):
                continue

            sheet_rows.append({
                "index": global_index,
                "question": question,
                "row_idx": i,
                "sheet": sheet_name
            })

            all_rows.append({
                "index": global_index,
                "question": question,
                "sheet":sheet_name,
                "row_idx": i
            })

            global_index += 1

        sheet_data[sheet_name] = {
            "df": df,
            "rows": sheet_rows
        }

    if len(all_rows) == 0:
        raise ValueError("No question column found in any sheet")

    return all_rows, sheet_data