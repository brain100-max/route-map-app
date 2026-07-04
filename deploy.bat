@echo off
chcp 65001 > nul

echo [1/3] Building...
call npm run build
if errorlevel 1 (
    echo Build failed!
    pause
    exit
)

echo [2/3] Copying dist files...
xcopy dist\assets\* assets\ /E /Y
copy dist\favicon.svg . /Y

echo Preparing index.html for GitHub Pages...
copy dist\index.html index.html /Y

echo [3/3] Pushing to GitHub...
git add .
git commit -m "deploy"
git push

echo Restoring source index.html...
git checkout index.html

echo Done! Refresh in 1-2 minutes.
pause