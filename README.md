# 金文字形檢索

金文字形檢索系統，可按字頭、主字頭/子字頭、部件/IDS、器名與來源檢索金文字形。

## 本地預覽

```powershell
python -m http.server 4173 --directory site
```

然後打開 `http://localhost:4173/`。

## GitHub Pages

本倉庫使用 GitHub Actions 將 `site/` 目錄部署到 GitHub Pages。

原始 PDF 與本地臨時文件不提交到倉庫；網頁所需的靜態索引、字形圖片與內嵌字形資產已位於 `site/`。
