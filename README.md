# 金文字形檢索

金文字形檢索系統，可按字頭、主字頭/子字頭、部件/IDS、器名與來源檢索金文字形。

## 本地預覽

```powershell
python -m http.server 4173 --directory site
```

然後打開 `http://localhost:4173/`。

PUA/未編碼字的篩選頁在 `http://localhost:4173/pua-filter.html`，可查看字頭可定位、僅上下文命中、CID 與未定位等類型。

協作標註頁在 `http://localhost:4173/annotate.html`。協作者可以為每個字圖填寫諧聲域、聲首、義符、詞義/詞例、備註、字頭校正、器名校正，也可以上傳重新截取的字圖/銘文圖像。資料保存在本機瀏覽器中，完成後可導出 JSON 發回維護者。

PDF 抽取時無法直接解碼的 CID 字形會以 PDF 文字層裁切小圖顯示，普通檢索不以 `(cid:xxxx)` 佔位符作為器名或來源文本。

## 協作標註資料

主站會讀取 `site/data/annotations.json` 中的標註資料，並在檢索頁新增諧聲域、聲首、義符與詞四類檢索欄位；其中諧聲域欄支持正則檢索。

標註頁導出的 JSON 采用 `jinwen-glyph-annotations-v1` 格式。每筆資料以字圖記錄 ID 為鍵，核心字段如下：

```json
{
  "records": {
    "672fdd9dae172941": {
      "headOverride": { "main": "", "sub": "" },
      "titleOverride": "校正器名",
      "imageOverride": {
        "dataUrl": "data:image/webp;base64,...",
        "name": "crop.webp",
        "type": "image/webp",
        "size": 12345,
        "updatedAt": "2026-05-24T00:00:00.000Z"
      },
      "xieshengDomain": "A",
      "phoneticInitials": [
        { "primary": "某", "secondary": ["某"] }
      ],
      "semanticComponents": ["金"],
      "words": [
        { "meaning": "詞義", "example": "器物中的詞例" }
      ],
      "note": "出處或說明"
    }
  }
}
```

## GitHub Pages

本倉庫使用 GitHub Actions 將 `site/` 目錄部署到 GitHub Pages。

原始 PDF 與本地臨時文件不提交到倉庫；網頁所需的靜態索引、字形圖片與內嵌字形資產已位於 `site/`。

## 資料來源與權利聲明

字形資料整理自：邱培強《金文字形全編》碩士論文，吉林大學，2025，DOI: `10.27162/d.cnki.gjlin.2025.007505`。本倉庫作者並非該論文作者，也不代表吉林大學或原著錄書籍出版方。

原論文收集商至秦代金文字形，處理銅器銘文 21,606 件，收錄金文字圖 210,664 個；字形圖像主要采自《殷周金文集成》《商周青銅器銘文暨圖像集成》及其《續編》《三編》。本頁僅作學術檢索、瀏覽與技術演示。

原論文、原始著錄書籍及字形圖像的相關權利歸各自權利人所有。引用或再利用資料時，請引用原論文與相應著錄來源，並遵守原權利要求；請勿將本站資料或圖像用於超出合理引用、研究、教學之外的再發布或商業用途。
