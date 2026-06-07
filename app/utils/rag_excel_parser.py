import pandas as pd

try:
    from app.utils.framework_detector import get_framework_question_col
    FRAMEWORK_DETECTION_ENABLED = True
except Exception:
    FRAMEWORK_DETECTION_ENABLED = False

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

    # ✅ Step 1: Exact match first — "Question" beats "Question ID"
    # Columns that are exactly one of these keywords win immediately
    exact_keywords = ["question", "control", "requirement", "description"]

    for col in df.columns:
        col_lower = str(col).lower().strip()
        if col_lower in exact_keywords:
            return col

    # ✅ Step 2: Partial keyword match — but skip ID/reference columns
    # "Question ID", "Question No", "Question Number", "Question #" are skipped
    skip_suffixes = ["id", "no", "num", "number", "#", "code", "ref"]

    for col in df.columns:
        col_lower = str(col).lower().strip()

        if any(keyword in col_lower for keyword in exact_keywords):
            # Skip if it looks like an ID/reference column
            if any(skip in col_lower for skip in skip_suffixes):
                continue
            return col

    # 🔥 Step 3: Content-based detection (fallback)
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

    # ❌ skip ID-like values (e.g. "AIS-01.1", "A&A-02.3")
    # Pattern: short alphanumeric with hyphens and dots, no spaces
    import re
    if re.match(r'^[A-Za-z0-9&]{1,10}-\d+\.\d+$', text.strip()):
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
    import io as _io

    if hasattr(file, 'read'):
        raw = file.read()
    else:
        raw = file.getvalue()

    excel_data = pd.read_excel(_io.BytesIO(raw), sheet_name=None)

    sheet_data = {}
    all_rows = []
    global_index = 0

    for sheet_name, df in excel_data.items():

        framework_key = None
        framework_answer_col = None

        if FRAMEWORK_DETECTION_ENABLED:
            try:
                from app.utils.framework_detector import detect_framework
                framework_key, framework_config = detect_framework("", sheet_name, df)

                if framework_key == "CAIQ":
                    # Re-read with header=1 to skip JSON metadata row
                    df_reread = None
                    try:
                        df_reread = pd.read_excel(
                            _io.BytesIO(raw),
                            sheet_name=sheet_name,
                            header=1
                        )
                        print(f"[CAIQ] Re-read with header=1 — {len(df_reread)} rows")
                        print(f"[CAIQ] Columns: {list(df_reread.columns[:6])}")
                    except Exception as e:
                        print(f"[CAIQ] Re-read failed: {e}")
                        df_reread = None

                    if df_reread is not None:
                        df = df_reread

                    skip_sheets = framework_config.get("skip_sheets", [])
                    if any(s in sheet_name.lower() for s in skip_sheets):
                        print(f"Skipping sheet (CAIQ rule): {sheet_name}")
                        continue

                    q_col = "Question"
                    framework_answer_col = "CSP Implementation Description (Optional/Recommended)"

                    print(f"[CAIQ] Looking for q_col={repr(q_col)} in columns={list(df.columns[:6])}")

                    if q_col not in df.columns:
                        print(f"[CAIQ] STILL NOT FOUND — columns are: {list(df.columns)}")
                        continue

                    print(f"✅ Framework detected: CSA CAIQ v4 on sheet {repr(sheet_name)}")

                elif framework_key is not None:
                    skip_sheets = framework_config.get("skip_sheets", [])
                    if any(s in sheet_name.lower() for s in skip_sheets):
                        print(f"Skipping sheet (framework rule): {sheet_name}")
                        continue

                    q_col = framework_config["question_col"]
                    framework_answer_col = framework_config["answer_col"]

                    if q_col not in df.columns:
                        framework_key = None
                    else:
                        print(f"✅ Framework detected: {framework_config['description']} on sheet {repr(sheet_name)}")
                else:
                    q_col = None

            except Exception as e:
                print(f"Framework detection error (non-fatal): {e}")
                framework_key = None
                q_col = None
        else:
            q_col = None

        if framework_key is None:
            if not is_valid_sheet(sheet_name, df):
                print(f"Skipping sheet: {sheet_name}")
                continue
            q_col = find_question_column(df)

        if not q_col:
            q_col = df.columns[0]

        df = df.copy()
        df["Answer"] = ""

        sheet_rows = []

        for i, row in df.iterrows():
            question = str(row[q_col]).strip()
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
                "sheet": sheet_name,
                "row_idx": i
            })
            global_index += 1

        sheet_data[sheet_name] = {
            "df": df,
            "rows": sheet_rows,
            "answer_col": framework_answer_col
        }

    if len(all_rows) == 0:
        raise ValueError("No question column found in any sheet")

    return all_rows, sheet_data
