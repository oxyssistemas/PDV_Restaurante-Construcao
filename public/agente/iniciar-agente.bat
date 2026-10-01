@echo off
title Oxys - Agente de impressao
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto semnode
if exist "oxys-agente.json" goto rodar
set /p CHAVE=Cole a chave do agente (Configuracoes - Impressoras - Agente local) e tecle Enter: 
node oxys-print-agent.mjs %CHAVE%
goto fim
:rodar
node oxys-print-agent.mjs
goto fim
:semnode
echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
start https://nodejs.org/pt-br/download
:fim
pause
