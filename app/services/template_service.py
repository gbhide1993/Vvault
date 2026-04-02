import numpy as np
from app.services.embedding_service import generate_embedding
import re
import hashlib

def normalize(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return text

# 🔥 SOC2 Answer Templates
TEMPLATES = {

    "encryption": "We use AES-256 encryption for data at rest and TLS 1.2+ for data in transit.",
    "mfa": "Multi-factor authentication (MFA) is enforced for all critical systems and privileged access.",
    "access_control": "Access is controlled using role-based access control (RBAC) with least privilege principles.",
    "least_privilege": "We enforce least privilege access to ensure users only have permissions necessary for their role.",
    "password_policy": "Strong password policies are enforced including complexity, expiration, and reuse restrictions.",
    "logging": "System and access logs are maintained and monitored for security events.",
    "monitoring": "Continuous monitoring is in place to detect anomalies and security incidents.",
    "vulnerability": "Regular vulnerability assessments are conducted and remediation is tracked.",
    "penetration_testing": "Annual penetration testing is conducted by external security experts.",
    "backup": "Regular backups are performed and tested to ensure data availability.",
    "disaster_recovery": "Disaster recovery procedures are defined and tested periodically.",
    "rto_rpo": "RTO and RPO targets are defined based on system criticality and business requirements.",
    "incident_response": "An incident response plan is in place to detect, respond, and recover from security incidents.",
    "audit": "Regular internal and external audits are conducted to ensure compliance and control effectiveness.",
    "training": "Employees undergo regular security awareness training.",
    "vendor": "Third-party vendors are assessed for security risks before engagement.",
    "data_retention": "Data retention policies are defined and enforced based on regulatory and business needs.",
    "data_deletion": "Secure data deletion procedures are followed when data is no longer required.",
    "cloud_security": "Cloud infrastructure is secured using industry best practices and continuous monitoring.",
    "network_security": "Firewalls and network security controls are implemented to restrict unauthorized access."
}

def pick_variant(options, question):
    """
    Deterministic variation based on question hash
    (so same question always gives same variant)
    """
    if not isinstance(options, list):
        return options

    h = int(hashlib.sha256(question.encode()).hexdigest(), 16)
    idx = h % len(options)

    return options[idx]


# 🔥 Natural language versions for embedding (IMPORTANT FIX)
TEMPLATE_QUERIES = {
    "encryption": "Do you use encryption for data at rest and in transit?",
    "mfa": "Is multi-factor authentication enforced for users and systems?",
    "access_control": "How is user access controlled and managed?",
    "least_privilege": "Do you follow least privilege access principles?",
    "password_policy": "What password policies are enforced?",
    "logging": "Do you maintain logs of system and user activity?",
    "monitoring": "Do you monitor systems for security events and anomalies?",
    "vulnerability": "Do you perform vulnerability assessments regularly?",
    "penetration_testing": "Do you conduct penetration testing?",
    "backup": "Do you perform regular backups of data?",
    "disaster_recovery": "Do you have a disaster recovery plan?",
    "rto_rpo": "What are your RTO and RPO targets for systems?",
    "incident_response": "Do you have an incident response process?",
    "audit": "Do you conduct internal or external audits?",
    "training": "Do employees receive security awareness training?",
    "vendor": "How do you manage third-party vendor risks?",
    "data_retention": "What is your data retention policy?",
    "data_deletion": "How do you securely delete data?",
    "cloud_security": "How is your cloud infrastructure secured?",
    "network_security": "How is your network protected from unauthorized access?"
}

# 🔥 Store embeddings
TEMPLATE_EMBEDDINGS = {}
INITIALIZED = False

# 🔥 Cosine similarity
def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def init_template_embeddings_once():
    global INITIALIZED

    if INITIALIZED:
        return

    print("⚡ Initializing template embeddings...")

    for key, text in TEMPLATES.items():
        try:
            TEMPLATE_EMBEDDINGS[key] = generate_embedding(text)
        except Exception as e:
            print(f"❌ Template embedding failed: {e}")

    INITIALIZED = True


# 🔥 Semantic template matching
def get_template_answer(question: str):
    q = normalize(question)

    # 🔥 STEP 1 — STRONG KEYWORD MATCH (VERY IMPORTANT)

    if any(x in q for x in ["aes", "encryption", "encrypt"]):
        return pick_variant(TEMPLATES["encryption"], question)

    if any(x in q for x in ["mfa", "multi factor", "multi-factor", "2fa"]):
        return pick_variant(TEMPLATES["mfa"], question)

    if "access" in q:
        return pick_variant(TEMPLATES["access_control"], question)

    if any(x in q for x in ["rto", "rpo"]):
        return pick_variant(TEMPLATES["rto_rpo"], question)

    if any(x in q for x in ["penetration",
                                "pen test",
                                "pentest",
                                "pen-test",
                                "pen tests",
                                "pen-tests",
                                "pen testing"]):
        return pick_variant(TEMPLATES["penetration_testing"], question)

    if any(x in q for x in ["backup"]):
        return pick_variant(TEMPLATES["backup"], question)

    if any(x in q for x in ["log", "logging"]):
        return pick_variant(TEMPLATES["logging"], question)

    if any(x in q for x in ["monitor"]):
        return pick_variant(TEMPLATES["monitoring"], question)

    if any(x in q for x in ["incident"]):
        return pick_variant(TEMPLATES["incident_response"], question)

    # 🔥 STEP 2 — SEMANTIC FALLBACK

    q_embedding = generate_embedding(question)

    best_score = 0
    best_template = None

    for key, emb in TEMPLATE_EMBEDDINGS.items():
        score = cosine_similarity(q_embedding, emb)

        if score > best_score:
            best_score = score
            best_template = key

    # 🔥 Lower threshold
    if best_score > 0.65:
        return TEMPLATES[best_template]

    return None