# How to pick the keywords for a one-screen run

Used in: `node tools/scope.mjs init "home screen" --keywords "..."`

Keywords are words that the screen and your documents actually use. The slicer keeps the parts of the FSD (by heading and content) and the API that match them. Gather them in 3 steps; the slice report tells you if you missed any.

---

## 1. Take them from the screen itself
The screen's own headings and labels are the best source.

**Prerequisite:** this tool (and the slicer) need the packages that **app-bootstrap Run 1** installs, and Node 22.22+ / 24.15+. Without them you get `Cannot find package '@playwright/test'`. Run app-bootstrap Run 1 first, plus `npx playwright install chromium`. If you cannot yet, open `dealer.html` in a browser, show the Home screen, and read its headings by eye (they are listed below).

With the packages installed, this prints every text on the Home screen:
```
node tools/design-spec.mjs extract inputs/ux/dealer.html#vHome
```
Open `analysis/design-spec/dealer-vHome.md` and read the **Texts** and **Blocks** sections.

Home's headings are:
- Indent progress
- Your July indent
- Your verticals
- Needs attention
- Summary
- Indent vs demand signal
- Stock on hand by age
- Demand mix
- Against ABP
- Your indent accuracy
- Rollup

If you have already run the analyzer, `analysis/interactions.md` and `analysis/components.md` list the same names.

## 2. Check them against your FSD's headings
The slicer matches FSD sections by heading and content, so look at what your FSD calls things:
```
grep -n "^#" inputs/fsd-spec.md
```
Your FSD has no "home" section. The Home screen is described under:
- `3. Personas` (the Dealer)
- `5. Indent Workflow — End to End`
- `6.1 Screen Design`

That is why the word "home" alone matched only 3 of 27 sections (the Dealer and Indent sections were dropped). Add the words that appear in those sections. Good ones for your project: `dealer`, `indent`, `cut-off`, `submission`, `offtake`, `stock on hand`.

## 3. Run, read the report, add what is missing
The slice report lists what it dropped. If a dropped section looks needed, add its words without starting again:
```
node tools/scope.mjs slice --also "cut-off"
```
Repeat until nothing important is under "dropped". Each round takes about 30 seconds and uses no model tokens. `node tools/scope.mjs show` prints what was kept and dropped at any time.

---

## A starting set for the Home screen
```
node tools/scope.mjs init "home screen" --keywords "home,dealer,indent,dashboard,needs attention,stock on hand,offtake,abp,cut-off"
```
Then add this line to `inputs/scope.md` so the agents know exactly which screen:
```
Screens: dealer.html#vHome (and the shared top bar)
```
and run `node tools/scope.mjs slice`.

---

## Tips
- **More keywords is safer.** A few extra sections cost a little; a missing section costs rework.
- **Use the words as they appear in the documents.** Matching is by keyword, so spelling and wording matter.
- **Read the list of sections in the report**, not only the totals.
- **The UX file is kept whole** when screens share one HTML file (Home and the Indent workbook are in `dealer.html`). The `Screens:` line is what keeps the other screens out, not the keywords.
- **The backend YAML may match nothing.** That is fine for a first screen: the agents propose and mock the endpoints.

See also: `RUN-ORDER-one-screen.md` (the full steps and prompts).
