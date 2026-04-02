from fastapi import FastAPI
from app.rag import router as rag_router
from app.routes.cache_routes import router as cache_router 
from app.routes.knowledge_routes import router as knowledge_router


from app.services.template_service import init_template_embeddings_once

app = FastAPI()


app.include_router(rag_router)

app.include_router(cache_router)

app.include_router(knowledge_router)