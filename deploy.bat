@echo off
echo Pushing to GitHub...
git add .
git commit -m "deploy"
git push
echo Done! GitHub will build and deploy automatically.
pause