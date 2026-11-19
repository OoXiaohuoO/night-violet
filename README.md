# 夜紫 night-violet

Claude 桌面版的造型 mod：深色面板配紫色重點色，背景是會動的燈效，可以像 RGB 燈效軟體那樣自己調。

- **背景燈效**九種：靜態、呼吸、光譜循環、波浪、星光、火焰、漣漪、極光、輪轉。可以疊兩層，每層各自選效果、兩個顏色、速度（波浪還能選方向），另外有整體亮度。
- **背景圖片**：不用燈效的話，可以換成自己的圖。
- **選色**：在色譜或色票上點一下、或按住拖曳選色；也可以從色票清單選，或直接打色碼。
- **介面**：重點色、面板色調（五種）、選單亮度、面板透光、邊框加強、程式碼配色。
- 設定會記住，下次開 Claude 還在。

## 安裝

在終端機的 Claude Code 對話裡輸入：

```
/plugin install night-violet --marketplace OoXiaohuoO/night-violet
```

它會先問要不要加入這個來源（按 `y`），再問安裝範圍（直接按 Enter，選 user）。

從命令列安裝：

```
claude plugin install night-violet --marketplace OoXiaohuoO/night-violet
```

Claude 桌面版（那裡不能用 `/plugin`）：點輸入框旁邊的 +，選 Plugins，在 Add marketplace 填 `OoXiaohuoO/night-violet`，再按 Add plugin。

裝好之後開一個新的對話就會套上造型。

## 使用

輸入 `/look` 打開設定面板。面板分三區：

- **背景**：選燈效或圖片；燈效可以選圖層、效果、速度、方向、亮度。
- **顏色**：先在「要改的顏色」選一個，再在色譜或色票上點一下、或按住拖曳（放開才套用）；也可以從「色票」清單選，或打色碼。
- **介面**：面板色調、選單亮度、面板透光、邊框加強、程式碼配色、還原預設。

改了馬上生效，也會自動存起來。

## 用自己的圖當背景

把圖片放進 mod 資料夾裡的 `backgrounds/`，再到 `/look` 的「背景」選「圖片」。

- 格式：JPEG 或 PNG。
- 大小：1 MB 以內，長寬都在 4096 像素以內。
- 照上面的方式安裝的話，mod 資料夾在 `~/.claude/plugins/cache/night-violet/night-violet/<版本>/`。mod 更新到新版本之後，圖片要重新放一次。

## 限制

- 只有 Claude 桌面版會畫這個造型，終端機裡的 Claude 不會變。
- 會動的只有背景。
- 用圖片當背景的時候沒有燈效。
- 面板色調只影響深色模式。

這個 mod 是在 Claude Code 2.1.325 上做的；裝了沒反應，先把 Claude 更新到最新版。

## 移除

```
claude plugin uninstall night-violet
```
