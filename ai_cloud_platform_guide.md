# AI Cloud Platform for Deploying ML Models

##  Build Guide (Phase-by-Phase)

This guide is designed for Cursor to follow step‑by‑step to build the
full project.

------------------------------------------------------------------------

# Project Overview

Build a platform where users can: - Upload ML models - Automatically
containerize them - Deploy them to Kubernetes - Expose a prediction
API - Monitor model performance

Tech Stack: - Backend: FastAPI - Frontend: React - ML: scikit-learn -
Containerization: Docker - Orchestration: Kubernetes - Monitoring:
Prometheus + Grafana - Storage: Local → later S3 - Database: SQLite →
later PostgreSQL

------------------------------------------------------------------------

# Phase 1 --- Model Service (Inference API)

Goal: Serve a trained ML model locally.

## Steps

1.  Train a simple model (Iris classifier)
2.  Save as model.pkl
3.  Build FastAPI inference API
4.  Expose endpoints

Endpoints: GET /health POST /predict

Example request:

{ "features": \[5.1, 3.5, 1.4, 0.2\] }

Example response:

{ "prediction": 0 }

Files:

model-service/ - app.py - model.pkl - requirements.txt

requirements.txt

fastapi uvicorn scikit-learn numpy pydantic

Test:

uvicorn app:app --reload

------------------------------------------------------------------------

# Phase 2 --- Dockerize Model Service

Create Dockerfile

Dockerfile:

FROM python:3.10 WORKDIR /app COPY . . RUN pip install -r
requirements.txt CMD
\["uvicorn","app:app","--host","0.0.0.0","--port","8000"\]

Build:

docker build -t model-service .

Run:

docker run -p 8000:8000 model-service

Test prediction endpoint.

------------------------------------------------------------------------

# Phase 3 --- Control Backend

Purpose: Manage uploaded models and deployments.

Folder:

control-backend/

Files:

main.py database.py models.py schemas.py crud.py

Database table:

models

fields:

id name file_path status endpoint_url created_at

Statuses:

uploaded deploying running failed

APIs:

POST /models/upload GET /models GET /models/{id} POST
/models/{id}/deploy

------------------------------------------------------------------------

# Phase 4 --- Frontend Dashboard

Use React.

Pages:

UploadModel ModelsList ModelDetails Dashboard

Features:

Upload model View deployed models Deploy model View endpoint

Example table:

Model \| Status \| Endpoint

------------------------------------------------------------------------

# Phase 5 --- Kubernetes Deployment

Install:

minikube kubectl

Create folder:

k8s/

Files:

deployment.yaml service.yaml

Deployment should run model-service container.

Service exposes the pod.

Deploy:

kubectl apply -f deployment.yaml kubectl apply -f service.yaml

Test endpoint.

------------------------------------------------------------------------

# Phase 6 --- Deployment Automation

Backend should:

1.  receive deploy request
2.  generate deployment name
3.  run kubectl apply
4.  update DB status
5.  return endpoint URL

------------------------------------------------------------------------

# Phase 7 --- Monitoring

Install:

Prometheus Grafana

Expose metrics in model service.

Track:

request_count latency errors

Create Grafana dashboard.

------------------------------------------------------------------------

# Phase 8 --- Autoscaling

Use Kubernetes HPA.

Example rules:

minPods: 1 maxPods: 5 scale when CPU \> 70%

------------------------------------------------------------------------

# Phase 9 --- Documentation

Create docs folder.

Include:

architecture diagram API docs deployment instructions screenshots

------------------------------------------------------------------------

# Final Resume Project Title

Cloud‑Native ML Model Deployment Platform

Resume bullet:

Built a cloud platform that automatically containerizes and deploys
machine learning models using FastAPI, Docker, and Kubernetes with
monitoring via Prometheus and Grafana.

------------------------------------------------------------------------

# Cursor Instructions

When implementing this project:

1.  Follow phases sequentially
2.  Generate missing code files
3.  Ensure each phase runs before moving to the next
4.  Use clean modular architecture
5.  Add comments explaining functionality
