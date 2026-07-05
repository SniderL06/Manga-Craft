@echo off
title MangaCraft Launcher
color 0b

echo ===================================================
echo             🎌 launching MangaCraft 🎌
echo ===================================================
echo.
echo [1/2] Iniciando servidores de desarrollo y proxy...
echo.

cd /d "C:\Users\snide\.gemini\antigravity\scratch\manga-craft"

:: Iniciar el comando concurrently que levanta el frontend y el backend proxy
start cmd /k "npm run start"

echo.
echo [2/2] Esperando a que el servidor se configure...
timeout /t 3 /nobreak > nul

echo.
echo [OK] Servidores iniciados.
echo [OK] Abriendo MangaCraft en tu navegador...
echo.

start http://localhost:5173/

echo ===================================================
echo     ¡Listo! Mantén la otra ventana abierta para
echo       que funcione la generación de imágenes.
echo ===================================================
timeout /t 5 > nul
exit
