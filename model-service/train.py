from __future__ import annotations

from pathlib import Path

import joblib
from sklearn.datasets import load_iris
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split


def main() -> None:
    iris = load_iris()
    X_train, X_test, y_train, y_test = train_test_split(
        iris.data, iris.target, test_size=0.2, random_state=42, stratify=iris.target
    )

    model = LogisticRegression(max_iter=500, n_jobs=1)
    model.fit(X_train, y_train)

    acc = float(model.score(X_test, y_test))
    out_path = Path(__file__).with_name("model.pkl")
    joblib.dump(
        {"model": model, "feature_names": list(iris.feature_names), "accuracy": acc},
        out_path,
    )
    print(f"Saved {out_path} (test_accuracy={acc:.3f})")


if __name__ == "__main__":
    main()

