import re

FRAMEWORK_REGISTRY = {
    "CAIQ": {
        "sheet_keywords": ["caiq", "consensus"],
        "skip_sheets": ["cover", "intro", "instruction", "changelog", "readme"],
        "question_col": "Control Specification",
        "answer_col": "CSP Implementation Description (Optional/Recommended)",
        "id_col_pattern": r"^[A-Z]{2,4}-\d+\.\d+",
        "description": "CSA CAIQ v4"
    },
    "SIG_LITE": {
        "sheet_keywords": ["sig lite", "sig-lite", "siglite"],
        "skip_sheets": ["cover", "instruction", "glossary", "summary", "lookup"],
        "question_col": "Question",
        "answer_col": "Response",
        "id_col_pattern": r"^[A-Z]\.\d+",
        "description": "Shared Assessments SIG Lite"
    },
    "SIG_CORE": {
        "sheet_keywords": ["sig core", "sig full", "sig-core"],
        "skip_sheets": ["cover", "instruction", "glossary", "summary", "lookup"],
        "question_col": "Question",
        "answer_col": "Response",
        "id_col_pattern": r"^[A-Z]\.\d+",
        "description": "Shared Assessments SIG Core"
    },
    "VSAQ": {
        "sheet_keywords": ["vsaq"],
        "skip_sheets": ["instruction", "cover"],
        "question_col": "Question",
        "answer_col": "Answer",
        "id_col_pattern": None,
        "description": "Google VSAQ"
    }
}


def detect_framework(filename="", sheet_name="", df=None):
    try:
        filename_lower = filename.lower() if filename else ""
        sheet_lower = sheet_name.lower() if sheet_name else ""

        for key, config in FRAMEWORK_REGISTRY.items():
            for keyword in config["sheet_keywords"]:
                if keyword in filename_lower or keyword in sheet_lower:
                    return key, config

            if df is not None:
                cols = [str(c).strip() for c in df.columns]
                if config["question_col"] in cols:
                    return key, config

        return None, None

    except Exception as e:
        print(f"Framework detection error (non-fatal): {e}")
        return None, None


def get_framework_question_col(filename="", sheet_name="", df=None):
    key, config = detect_framework(filename, sheet_name, df)
    if config:
        print(f"✅ Framework detected: {config['description']} on sheet '{sheet_name}'")
        return config["question_col"], config["answer_col"], config["skip_sheets"]
    return None, None, None


def should_skip_sheet(sheet_name, skip_sheets):
    try:
        sheet_lower = sheet_name.lower()
        return any(skip in sheet_lower for skip in skip_sheets)
    except:
        return False


def read_caiq_sheet(file, sheet_name):
    import pandas as pd
    try:
        df = pd.read_excel(file, sheet_name=sheet_name, header=1)
        cols = [str(c) for c in df.columns]
        if "Question" in cols or any("Implementation" in c for c in cols):
            print(f"[framework_detector] CAIQ read with header=1 — {len(df)} rows")
            return df
    except Exception as e:
        print(f"[framework_detector] header=1 failed: {e}")

    return pd.read_excel(file, sheet_name=sheet_name)
