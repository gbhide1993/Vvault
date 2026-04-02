def build_confidence(source: str, context: str = None):
    
    if source == "cache":
        return 0.95, "Answer reused from approved historical response"
    
    if source == "template":
        return 0.85, "Matched predefined SOC2 template answer"
    
    if source == "llm":
        if context and len(context.strip()) > 50:
            return 0.75, "Generated using relevant company knowledge context"
        else:
            return 0.55, "Generated with limited context"
    
    return 0.5, "Default confidence"