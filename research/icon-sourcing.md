# Growing the Pucklet icon library: open sources vs. paper mining vs. AI generation

*Research date: 17 October 2026. This is not legal advice. Clauses marked "verify" come from secondary sources or pages that could not be loaded, so check them before relying on them.*

---

## TL;DR

| Option | Verdict | Why |
|---|---|---|
| **Other openly licensed vector collections** (TogoTV/DBCLS, Servier vector kits, SwissBioPics, Expression Atlas anatomograms, Arcadia organisms, Health Icons, NIH BioArt, SciDraw, filtered Wikimedia Commons) | **Do first** | Thousands of native SVGs with clear CC0/CC BY/PD licences and per-item provenance. Cheapest growth by far. |
| **Mining PMC Open Access figures for icons** | **Don't use it as an icon source.** Use it only as a demand signal. | Figures are mostly JPEG raster. The CC BY label often doesn't cover third-party artwork inside the figure: 40k+ CC BY papers mention BioRender. Segmentation plus tracing gives poor, non-recolourable icons. |
| **AI generation** | **Do third, narrowly, with clear labelling** | Useful to fill gaps (simple flat icons via LLM-written SVG). Two big constraints: (a) Nature/Springer Nature bans AI-generated illustrations and Science requires editor permission, so users need to be able to exclude AI icons; (b) several vendors' terms (Recraft, Adobe) are incompatible with releasing outputs under CC0. |

---

## Part 1: Sourcing icons from research papers and open repositories

### 1.1 PubMed Central Open Access (PMC OA)

**Licences.** PMC sorts the OA Subset by terms of use:
- **Commercial use allowed:** CC0, CC BY, CC BY-SA, CC BY-ND.
- **Non-commercial only:** CC BY-NC, CC BY-NC-SA, CC BY-NC-ND.
- **Other:** no machine-readable CC licence, or a custom licence. PMC limits distribution of this group.

Sources: [PMC OA Subset](https://pmc.ncbi.nlm.nih.gov/tools/openftlist/), [data.gov listing](https://catalog.data.gov/dataset/pubmed-central-open-access-subset-pmc-oa).

For Pucklet's purposes (derivatives allowed, no SA by default, commercial OK), only **CC0 and CC BY** are usable. ND forbids the cropping, recolouring and vectorising that icon-making requires.

**Bulk access changed in 2026. This matters for any pipeline.** NLM retired the FTP article datasets, the OA Web Service API and the legacy `oa_comm`/`oa_noncomm` cloud folders in **August 2026**. There are no more bulk tarballs. Sources: [NLM Technical Bulletin](https://www.nlm.nih.gov/pubs/techbull/jf26/jf26_Changes_to_PMC_ArtDsDistribServs_2026.html), [PMC Cloud Service](https://pmc.ncbi.nlm.nih.gov/tools/cloud/).

The only route now is the AWS open-data bucket `s3://pmc-oa-opendata` (anonymous with `--no-sign-request`, about 8 million article versions):
- Each article-version prefix (e.g. `PMC10009416.1/`) holds the JATS XML, the TXT, a JSON metadata file, the PDF when permitted, and **figure images as `.jpg`** (e.g. `NPR2-43-85-g001.jpg`).
- The JSON has a `license_code` field (CC codes, or `TDM` for author manuscripts), plus `is_pmc_openaccess`, `is_retracted`, `media_urls` and `pdf_url`.
- **Licence is no longer split at directory level.** You filter on `license_code`, or pre-select PMCIDs with E-utilities filters such as `cc0 license[filter] OR cc by license[filter]`.

Sources: [bucket README](https://pmc-oa-opendata.s3.amazonaws.com/README.txt), [PMC AWS docs](https://pmc.ncbi.nlm.nih.gov/tools/pmcaws/).

The README also says redistributors must "only distribute data that are licensed for redistribution" and must acknowledge NLM.

Only the Cloud Service, OAI-PMH, E-utilities and BioC API may be used for automated retrieval. Other systematic scraping of PMC is prohibited ([PMC OA](https://pmc.ncbi.nlm.nih.gov/tools/openftlist/)).

**Scale check (Europe PMC REST API, run 17 Oct 2026).** Open-access records number about 8.3 million. These are full-text hits, mostly in figure legends:

| Query | Hits |
|---|---|
| `"BioRender"` | **64,246** |
| `"BioRender" AND LICENSE:"cc by"` | **40,497** |
| `"Servier Medical Art"` | 7,908 |
| `"Servier Medical Art" AND LICENSE:"cc by"` | 5,535 |

Source: [Europe PMC REST API](https://www.ebi.ac.uk/europepmc/webservices/rest/search).

**Figure extraction tools**
- **PMC figure files.** Already separated in the bucket as JPEG, with captions in the JATS `<fig>`/`<caption>` elements. This is the easiest route, and it is **raster**.
- **pdffigures2** (Allen AI, Apache-2.0). Finds captioned figures in PDFs and saves them as raster by default. Vector output via `pdftocairo` is "experimental" ([docs](https://docsearch.algolia.com/mcp/docs/repo/allenai/pdffigures2)). Vector extraction from PDFs is hard because graphics and text are interleaved in the content stream ([Clark & Divvala / Penn State paper](https://clgiles.ist.psu.edu:443/pubs/doceng2015-src-figextraction.pdf)). Many publisher PDFs embed figures as raster anyway, because authors submit TIFF/JPEG.
- **Open-i (NLM).** Image search over PMC figures, with web filters for image type ("Graphics") and licence ("Attribution", "Attribution noncommercial", etc.) ([NLM/HSLS description](https://info.hsls.pitt.edu/updatereport/2019/july-2019/open-i%C2%AE-a-unique-image-search-engine/)). It has a REST API documented at `openi.nlm.nih.gov/services` ([data.gov entry](https://catalog.data.gov/dataset/open-i/resource/e200d2db-98e4-48d5-a397-89dd75b12675)). **The site was "under maintenance" when checked (Oct 2026)**, so parameter names could not be confirmed (verify). Open-i returns PNG/JPEG previews only.

**Vector or raster?** In practice almost always **raster**: JPEG in PMC, PNG previews in Open-i. Vector exists only inside some publisher PDFs and is hard to isolate.

### 1.2 The critical caveat: third-party artwork inside "CC BY" papers

**The 2024 BioRender/CC BY controversy**
- Simon Dürr, an enzymologist and the creator of Bioicons, found that many papers published under CC BY contain BioRender figures. When he asked BioRender about two of them, BioRender said they would need correction. When he flagged **9,277** CC BY papers (12,059 including other licences), BioRender stopped responding. Sources: [Chemistry World, 28 Oct 2024](https://www.chemistryworld.com/news/thousands-of-published-studies-may-contain-images-with-incorrect-copyright-licences/4020367.article), [Plagiarism Today, 28 Oct 2024](https://www.plagiarismtoday.com/2024/10/28/why-thousands-of-studies-may-be-in-copyright-limbo/).
- **BioRender's position.** Paid-plan users can publish CC BY figures with a generated publication licence and a required citation line. Free users may not publish at all. The icons themselves remain BioRender's licensed content. Plagiarism Today notes that BioRender's formal terms claim copyright in modifications of its content within completed graphics, and that **BioRender prohibits derivative use of its icons without a licence**. So cropping an icon out of a "CC BY" figure is exactly the use that conflicts with BioRender's terms. Sources: [BioRender help (CC BY attribution)](https://help.biorender.com/hc/en-gb/articles/29469723801117-Attributing-CC-BY-licensed-BioRender-figures), [CASRAI guide](https://www.casrai.org/guides/biorender).
- eLife reportedly began marking BioRender illustrations as carrying a different licence from the rest of the paper ([Chemistry World](https://www.chemistryworld.com/news/thousands-of-published-studies-may-contain-images-with-incorrect-copyright-licences/4020367.article)). eLife's own author guide says copyrighted material may be included only if the holder permits reproduction under CC BY ([eLife author instructions](https://elife-rp.msubmit.net/html/elife-rp_author_instructions.html)).
- **The problem has grown.** Europe PMC now finds **about 40,500 CC BY articles mentioning BioRender**, about 4x Dürr's 2023 count. A similar but smaller issue applies to Servier art (CC BY 4.0, so legally reusable but needing Servier attribution, not the paper authors'), and to stock art (Freepik, Flaticon, Shutterstock, Adobe Stock, iStock, Vecteezy, Noun Project, Mind the Graph).

**Legal risk to Pucklet.** An article's CC BY licence covers only what the authors could license. Embedded third-party art keeps its own terms, and the reuser bears the risk.

If Pucklet redistributed an icon traced from a BioRender figure, it would be distributing an unlicensed derivative to every user, in every past release. The likely consequences:
- DMCA takedowns against the repo.
- A forced purge from released versions.
- Possible infringement claims. US statutory damages can reach $150k per work if wilful.
- Most damaging: loss of the library's "everything is cleanly licensed" promise, which is Pucklet's main differentiator from BioRender. BioRender is an obvious adversarial party here.

**Detection pipeline, if paper figures are used at all**
1. **Licence gate:** `license_code ∈ {cc0, by}`. Drop retracted articles.
2. **Caption/XML text screen (JATS caption, acknowledgements, footnotes, permissions).** Case-insensitive regexes:
   - `biorender`, `created (with|in) biorender`, `BioRender\.com/[a-z0-9]+`
   - `servier`, `smart\.servier`, `mind the graph`, `freepik`, `flaticon`, `shutterstock`, `istock`, `adobe stock`, `vecteezy`, `noun ?project`, `canva`
   - `adapted from`, `reproduced (from|with permission)`, `©`, `copyright`, `courtesy of`
3. **In-image OCR** (e.g. Tesseract/PaddleOCR) for watermarks and credit lines inside the pixels. Older BioRender exports carried a "Created with BioRender.com" mark, and many authors put the credit in the image rather than the caption.
4. **Near-duplicate matching.** Use perceptual hashing or CLIP embeddings against known libraries: Servier PNGs (3,314 are on Commons), Bioicons, Reactome, PhyloPic and NIH BioArt. Optionally add a small classifier trained on "BioRender-style vs. other" figures.
5. **Policy:** any hit means exclude the whole figure. No hit still isn't proof of clean licensing, because authors often omit credits. That residual false-negative rate is the core reason not to ship paper-derived icons.

**Feasibility of turning figure elements into icons**
- **Segmentation.** SAM/SAM 2 or background removal (e.g. BiRefNet) can isolate elements. But figure elements overlap arrows, labels and other shapes, and are often 50–200 px at JPEG quality.
- **Vectorisation:**
  - **potrace** (GPL) gives good *silhouettes* only.
  - **vtracer** (MIT) handles colour, with `--max-colors`, `--filter-speckle` and spline modes ([vtracer](https://github.com/visioncortex/vtracer)).
  - From small lossy rasters, both produce blobby shapes with dozens to hundreds of stacked paths. They lack semantic layers (membrane, nucleus) and have no clean flat-fill structure, so recolouring breaks.
- **Quality and yield.** Expect most candidates to need manual redrawing. By then the effort is close to drawing from scratch, with added licence risk.
- **Verdict: not worth it as an icon source.** What *is* worth doing is mining PMC captions and figures as a **demand signal**: which concepts researchers draw most (e.g. "T cell", "organoid", "CRISPR-Cas9", "mouse", "96-well plate"). Use that to prioritise gaps for open sources or human/AI drawing.

### 1.3 Other sources worth adding

| Source | Licence | Approx. count | Format | Bulk access | Notes |
|---|---|---|---|---|---|
| **DBCLS TogoTV / Togo Picture Gallery** | **CC BY 4.0**. Credit: "Togo Picture Gallery © DBCLS licensed under CC Attribution 4.0 International" | ~1,575 SVGs mirrored on Commons (category has 1,637 files). The site has more. | PNG, **SVG**, AI | Official archive with CSV image list and per-format zips (`svg_format.zip` ~127 MB, snapshot 2020-07-22) at [dbarchive](https://dbarchive.biosciencedbc.jp/data/togo-pic/LATEST/README_e.html). Per-image DOIs (`10.7875/togopic.*`). Newer images via [togotv.dbcls.jp](https://togotv.dbcls.jp/en/pics.html) or Commons [Category:Life science images from DBCLS](https://commons.wikimedia.org/wiki/Category:Life_science_images_from_DBCLS). | **Top pick.** A flat style close to Bioicons. Some are "fake SVGs" (embedded raster): 25 are tagged in Commons "Fake SVGs by Yayamamo". Reject any SVG containing `<image>`. |
| **Servier Medical Art (SMART)** | **CC BY 4.0** ([smart.servier.com](https://smart.servier.com/)) | >3,000 | Per-image PNG. **PPTX kits by category** ("Download all slide set", ~170 MB) ([kits](https://smart.servier.com/image-kits-by-category)). | Kit zip downloads. A Commons mirror exists ([Media from SMART-Servier Medical Art](https://commons.wikimedia.org/wiki/Category:Media_from_SMART-Servier_Medical_Art), 3,314 files, **all PNG/JPG**, no SVG). | **SVG route:** Servier calls its images "fully customizable vector images" for PowerPoint ([tutorials](https://smart.servier.com/tutorial-video)), so the PPTX kits hold native DrawingML vectors. Convert with LibreOffice headless (`soffice --convert-to svg` per slide), or parse DrawingML with python-pptx into SVG paths. Verify on one kit first. Follow their "How to cite" page. Style is gradient-heavy, so recolouring needs palette mapping. |
| **NIH BioArt Source (NIAID)** | Mostly **public domain** (~96% of featured items per a secondary source). The rest is CC BY 4.0, set per entry. Credit pattern: "Illustration from NIAID NIH BioArt Source (bioart.niaid.nih.gov/bioart/###)" ([terms](https://bioart.niaid.nih.gov/terms)). | ~2,000+ | NIAID and third parties list EPS/AI/PNG/**SVG** ([NIAID news](https://www.niaid.nih.gov/news-events/nih-bioart-source-free-biomedical-art-resource-library), [UW–Madison](https://bcrf.biochem.wisc.edu/2024/11/21/free-nih-bioart-2d-and-nih-3d/)). But entry `/bioart/10` (checked today) showed "No available downloadable files", while describing the art as vector (Illustrator 28.7). | **No documented public API or bulk export.** The Next.js frontend calls internal `/api/bioarts/{id}/files/` paths, which are not public (guessed endpoints returned 404). NIH 3D ([3d.nih.gov](https://3d.nih.gov)) covers 3D models only and has no 2D BioArt API. | **Confirms your finding:** no official API. Formats vary by entry; PNG-only is common. Because most entries are PD, **email NIAID** (niaidnews@niaid.nih.gov) and ask for the source AI/SVG files in bulk; that's legal to redistribute. Avoid aggressive scraping: the terms don't address it, but it's a .gov site. |
| **SciDraw (scidraw.io)** | **CC BY 4.0** per drawing, archived on Zenodo with DOIs ([example](https://zenodo.org/records/4724285)) | ~1,500 (secondary source: [scifig.ai](https://scifig.ai/blog/free-scientific-icon-libraries-2026)) | SVG | Zenodo records (Zenodo REST API) | Strong for neuroscience, lab animals and apparatus. Check each record's licence. |
| **SwissBioPics (SIB)** | **CC BY 4.0**. Credit SwissBioPics, link the licence, note changes ([help](https://www.swissbiopics.org/help), [paper](https://pubmed.ncbi.nlm.nih.gov/35411389/)) | 48+ cell types, each with many tagged organelles | **SVG**, with organelles tagged by UniProt subcellular-location IDs | API and npm web component | Excellent: semantically layered cells (organelles can be highlighted or recoloured). Cells from all kingdoms. |
| **Expression Atlas anatomograms (EMBL-EBI)** | **CC BY 4.0** for the SVGs; code is Apache-2.0 ([licence](https://www.ebi.ac.uk/gxa/licence.html), [README](https://cdn.jsdelivr.net/npm/anatomogram@2.1.2/README.md)) | Dozens of species and organs | **SVG**, with tissues tagged by UBERON/PO IDs | npm `@ebi-gene-expression-group/anatomogram` / GitHub | Human, mouse and plant organ maps with ontology IDs; great for tissue icons. Asks for an attribution icon and a citation. |
| **Arcadia Science organism library** (Sept 2025) | **CC0** per the text. The page badge says CC BY 4.0, so confirm ([The Stacks](https://thestacks.org/publications/resource-organism-illustration-library)). | 71 organisms (growing) | SVG (silhouette and tricolour+stroke), PNG | GitHub Pages and [Zenodo 10.5281/zenodo.17203577](https://doi.org/10.5281/zenodo.17203577) | New and high quality. Some items adapt PhyloPic silhouettes, so carry their credits. |
| **Health Icons** | **CC0** ([about](https://healthicons.org/about)). The repo's code is MIT. | Thousands (count unverified) | SVG and PNG, filled and outline, 24/48 px | `healthicons.org/icons.zip`, npm `healthicons` ([GitHub](https://github.com/resolvetosavelives/healthicons)) | Public-health and medical UI glyphs. Monochrome, so trivially recolourable. Good for clinical and epidemiology figures. |
| **Wikimedia Commons** | Mixed: PD, CC0, CC BY, **many CC BY-SA/GFDL** | e.g. 26,866 SVG hits under `deepcat:"SVG biology"`. Fake SVGs are common ([Category:Fake SVG](https://commons.wikimedia.org/wiki/Category:Fake_SVG) has 979). | SVG | MediaWiki API: `list=search` with `filemime:image/svg+xml`, `deepcat:`/`incategory:`, and `haswbstatement:P275=<licence QID>` (e.g. Q20007257 = CC BY 4.0, Q6938433 = CC0). Then `prop=imageinfo&iiprop=extmetadata` for `LicenseShortName`/`Artist`/`Credit`. **Set a User-Agent and throttle**; we hit rate limits quickly ([rate-limit policy](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)). | Best for diagrams rather than icons. Quality is uneven, and many files contain baked-in text labels. Filter out SA and GFDL. |
| **PDB-101 / Goodsell art** | **CC BY 4.0** (credit David S. Goodsell & RCSB PDB) ([MotM download](https://PDB101.rcsb.org/motm/motm-image-download)). Irving Geis images are HHMI and non-commercial, so **exclude** them. | Hundreds | **Raster** paintings | Per-image download | Use as "image assets" (background molecular scenes), not icons. |
| **OpenMoji** | **CC BY-SA 4.0** ([GitHub](https://github.com/hfg-gmuend/openmoji)) | ~4,000 | SVG | Releases, npm | **Excluded by your SA rule.** No dedicated medical subset; offer it as an optional opt-in pack at most. |
| Noun Project, Flaticon, Freepik, BioRender, Mind the Graph | Proprietary | – | – | – | **Avoid.** |

*Already bundled:* Bioicons (MIT/CC0/CC BY/BSD/CC BY-SA set per icon, ~3k; [GitHub](https://github.com/duerrsimon/bioicons)), Reactome, and PhyloPic (~10k+).

**Realistic upside from Part 1:** about 5,000–8,000 additional native-vector items:
- TogoTV ~1.6k+
- Servier ~3k, if the PPTX conversion holds up
- Health Icons, SwissBioPics, anatomograms, Arcadia, SciDraw, and a NIH BioArt subset
- a curated Commons slice

This needs no AI and no paper mining.

---

## Part 2: Generating icons with AI

### 2.1 Tools and their licence/ToS fit

A key principle: **if Pucklet releases icons as CC0 (or under MPL/CC BY), anyone may train AI on them.** So any tool whose terms bind *you* to stop third parties from training on its outputs, or that grants only a revocable, non-sublicensable licence, is incompatible with an open library.

| Tool | Type | Licence / terms | Fit for an open library |
|---|---|---|---|
| **Frontier LLMs writing SVG** (e.g. Claude) | Text→SVG code | Anthropic Commercial Terms (eff. 17 Jun 2025): the customer "owns its Outputs" and Anthropic assigns its rights "if any". The restriction concerns using the *Services* to build competing models, not the outputs ([terms](https://www.anthropic.com/legal/commercial-terms)). | **Good.** Clean, minimal, hand-editable SVG with flat fills and named groups, so recolouring is trivial. Weak on complex anatomy and organic shapes. Benchmarks find proprietary LLMs ahead of open ones, and all models degrade with complexity ([SVGenius](https://arxiv.org/pdf/2506.03139), [SVGEval 2026](https://arxiv.org/pdf/2608.01977)). |
| **StarVector-8B / 1B** (ServiceNow) | Image→SVG, text→SVG | **Apache-2.0** weights ([model card](https://huggingface.co/starvector/starvector-8b-im2svg)). Trained on SVG-Stack (~2M SVGs). | **Good for vectorising simple icon rasters.** The card says it "will not work for natural images or illustrations". Best on icons, logos and diagrams. |
| **OmniSVG** (Fudan/StepFun; 3B, and 1.1-4B Dec 2025) | Text/image→SVG | Model Apache-2.0, but its **MMSVG-2M training data is CC BY-NC-SA** ([HF](https://huggingface.co/OmniSVG/OmniSVG), [4B](https://huggingface.co/OmniSVG/OmniSVG1.1_4B), [paper](https://arxiv.org/abs/2504.06263)). Qwen2.5-VL base; check that licence. | **Usable but provenance-murky.** Avoid fine-tuning on MMSVG. |
| **Recraft** (V4/V4.1 vector, "Styles" from 1–10 reference images) | Text→SVG, vectorise | API: V4.1 Vector $0.088, Pro $0.33, Styles Vector $0.055/image, vectorise $0.011 ([pricing](https://www.recraft.ai/pricing?tab=api)). Terms (11 Aug 2026): paid users own assets, but the licence is "non-sublicensable, non-assignable, freely revocable"; **assets "may not be used to train AI models"**; you may not remove machine-readable metadata, or use the service to build competing products ([terms](https://www.recraft.ai/terms)). The API is governed by separate [Developer Terms](https://www.recraft.ai/legal/developer-terms) (verify). | **Avoid for the shipped library.** Its no-training and revocability terms conflict with CC0/MPL redistribution, and a "competing services" clause is risky for a BioRender alternative. |
| **Adobe Illustrator Text-to-Vector (Firefly)** | Text→vector | Marketed "commercially safe". The Generative AI User Guidelines forbid users from using, **or allowing third parties to use**, outputs to train AI ([guidelines](https://www.adobe.com/uk/legal/licenses-terms/adobe-gen-ai-user-guidelines.html)). | **Avoid for redistribution**, for the same reason. |
| **Raster diffusion + vectorise** | Text→PNG→SVG | **FLUX.1 [schnell]: Apache-2.0** (fine). **FLUX.1 [dev]: non-commercial licence; avoid.** SDXL: OpenRAIL++-M (use restrictions pass through). Qwen-Image: reportedly Apache-2.0; newer Qwen-Image releases may be non-commercial (verify) ([FLUX licence guide](https://www.promptzone.com/zuzanna_choi/flux-ai-license-key-insights-2g8d)). Vectorise with vtracer (MIT) or potrace (GPL; fine as an offline tool, don't bundle it). | **Good for organic shapes** (organs, organisms, cells) if you use a LoRA plus palette quantisation. More cleanup is needed. |

**Can outputs be released as CC0/MPL?**
- In the US, purely AI-generated material has **no copyright** (human authorship required). *Thaler v. Perlmutter*, 130 F.4th 1039 (D.C. Cir. 2025); the Supreme Court **denied cert on 2 Mar 2026** ([Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2026/03/supreme-court-denies-review-in-ai-authorship-case), [Baker Donelson](https://www.bakerdonelson.com/supreme-court-denies-certiorari-in-thaler-v-perlmutter-ai-cannot-be-an-author-under-the-copyright-act)). Human selection and editing may add thin protection.
- Other jurisdictions (e.g. the UK's "computer-generated works" rule) may grant rights.
- **Recommendation:** release AI-generated icons as **CC0**. CC0 waives whatever rights exist anywhere and is honest about the thin rights position. Use it only with tools whose terms let you do so (LLM-SVG via Anthropic, self-hosted Apache-licensed models).

### 2.2 House style, recolourability and training on our own icons

**Style spec first.** Write it as a short doc and enforce it with a linter:
- viewBox `0 0 512 512`
- 2–4 fill tones per object from a fixed palette, plus one outline stroke width
- no gradients or filters, and no `<image>` or text
- named `<g id="primary|secondary|outline">` groups, or CSS classes/`currentColor`, so Pucklet's recolour UI works
- max ~60 paths, and pass through `svgo`

**Style transfer options**
- **LLM-SVG:** few-shot prompting with 5–10 exemplar SVGs from the existing CC0 set, plus the spec. Iterate by rendering the output and feeding it back to the model, as in "visual-feedback" methods such as [GVR-Coder](https://www.alphaxiv.org/abs/2607.28073.md).
- **Diffusion:** a LoRA on FLUX.1-schnell or SDXL trained on about 200–500 rasterised house icons. Then run vtracer with `--palette`/`--max-colors 4–6`, snap colours to the palette, and lint.

**Does training on CC BY icons create attribution obligations?** Unsettled law:
- Creative Commons' guidance: whether licence conditions apply depends on whether training exercises a reserved right in your jurisdiction (there are TDM exceptions in the EU/UK/Japan, and fair use in the US). If they do apply, attribution can be as light as **a link to the training dataset**. SA licences raise the question of whether the model is an "adaptation" ([CC: using CC-licensed works for AI training](https://creativecommons.org/using-cc-licensed-works-for-ai-training-2/), [CC 2023 explainer](https://creativecommons.org/2023/08/18/understanding-cc-licenses-and-generative-ai/)).
- **Separately, any output that closely resembles a specific CC BY training icon may itself be an adaptation and need that icon's attribution.**

Conservative policy:
1. Train style LoRAs on **CC0/PD/MIT plus Pucklet's own icons only**. If CC BY is included, publish a dataset manifest with full credits alongside any released LoRA.
2. **Never include SA or NC items.**
3. Run a **near-duplicate check** (CLIP/DINO embedding plus perceptual hash) of every output against the training set. Drop it, or attribute it, above a threshold.

### 2.3 Scientific accuracy: the main risk

Typical AI errors in biomedical art:
- **Molecules:** left-handed or wrong-groove DNA; antibodies without 2 heavy + 2 light chains; random protein "blobs".
- **Cells:** a single-layer "bilayer"; wrong mitochondrial cristae; ribosomes on the wrong membrane; implausible virus capsid symmetry or spike counts.
- **Organisms and anatomy:** wrong counts (heart chambers, insect legs, digits); mirrored anatomy (heart on the right, liver on the left); invented lab hardware; garbled text.

LLM-written SVG avoids photoreal hallucinations but makes *schematic* mistakes (wrong topology).

**Required review process (every AI icon)**
1. **Automated lint:** spec compliance, no text or raster, path count, palette, similarity to training data.
2. **Domain review** by someone with relevant training, against a **category checklist** (molecules, cells, organs, organisms, lab equipment). The reviewer records a **reference** in the metadata (PDB ID, anatomy atlas, NCBI taxon/PhyloPic, manufacturer photo).
3. **Style review and cleanup** by an illustrator or designer.
4. Two sign-offs (`reviewed_by`), and a public **"report an error"** link per icon.

### 2.4 Journal policies on AI-generated images (as of Oct 2026)

| Publisher / journal | Policy relevant to AI-made icons in figures | Source |
|---|---|---|
| **Springer Nature / Nature Portfolio** | **"Unable to permit" generative-AI images**, explicitly covering illustrations "such as scientific diagrams" and "drawings, cartoons or other 2D or 3D visual representations". Narrow exceptions only, which must be labelled. Tables, flow charts and simple graphs are excluded. | [Springer Nature AI guidance](https://group.springernature.com/gp/group/ai/ai-guidance-for-our-researchers-and-communities) |
| **Science family (AAAS)** | AI-generated images and multimedia are **not permitted without explicit editor permission**; violations are misconduct. (Primary page returned 403; wording via library guides.) | [Brandeis guide](https://guides.library.brandeis.edu/citeai/publicationspecific), [UTSW guide](https://utsouthwestern.libguides.com/artificial-intelligence/ai-publishing-science) |
| **Elsevier, incl. Cell Press** | AI may assist **explanatory images** (schematics), disclosed in the caption and AI statement. Never for primary data images. **"General-purpose generative AI image tools must not be used to create graphical abstracts"**; dedicated scientific illustration tools are encouraged. Cover art needs prior permission. | [Elsevier GenAI policy](https://www.elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals) (Cell author page 403; see [BioRender policy checker](https://policycheck.tools.biorender.com/journal/cell)) |
| **PLOS** | Allowed "for illustrative purposes or to summarize results" if not misrepresenting primary outputs. **Must be disclosed in the figure legend**, naming tools and how output was checked. | [PLOS ONE ethical publishing practice](https://journals.plos.org/plosone/s/ethical-publishing-practice) |
| **eLife** | AI use must be described in Methods; AI cannot be a co-author. "Striking images" cannot be AI-generated. Third-party content must be licensable under CC BY. | [eLife author instructions](https://elife-rp.msubmit.net/html/elife-rp_author_instructions.html) |

Note: a March 2026 arXiv survey ([2603.16159](https://arxiv.org/html/2603.16159v1)) describes Nature as permissive with disclosure. That **contradicts Springer Nature's own page**, and the author thanks a commercial AI-figure vendor, so don't rely on it.

**Implications for Pucklet.** A user who drops one AI-generated icon into a Nature, Science or Cell graphical-abstract figure could be non-compliant. So:
- **Provenance metadata on every icon:** `provenance: human | ai-assisted | ai-generated`, plus `generator` (model and version), `prompt_hash`, `human_edit_level`, `reviewed_by`, `reference`.
- A **UI badge** and **library filter**, plus a project-level **"journal-safe mode"** (default **on**) that hides `ai-generated` icons. Export-time warning: "This figure contains AI-generated elements; check the policy for <journal>". Include a short policy table in the app.
- **Auto credit line** adds a disclosure, e.g. *"Icons X, Y were generated with AI (model, version) and reviewed by Pucklet contributors."* This satisfies PLOS/Elsevier-style legend disclosure.
- Optionally embed C2PA/XMP provenance in exported files.
- Grey area: "AI-assisted" (a human redrew from an AI sketch). Treat it as AI under Nature's wording unless the final vector was fully human-drawn. Be conservative and transparent.

### 2.5 Recommended AI pipeline for a small team

1. **Gap list:** pick concepts from user requests, failed in-app searches, and PMC caption mining (Part 1.2). Batch by category.
2. **Generate** 4–8 candidates per concept:
   - **Simple/geometric** (lab equipment, molecules, symbols): LLM-written SVG with the style spec and few-shot exemplars, plus a render-and-critique loop.
   - **Organic** (organs, organisms, cell types): self-hosted FLUX.1-schnell or SDXL + house LoRA, then background removal, vtracer at 4–6 colours, palette snap and `svgo`. StarVector-im2svg is an alternative tracer for simple shapes.
3. **Automated lint and similarity screen** (see 2.2–2.3).
4. **Human curation:** pick the best candidate, clean it in Inkscape/Illustrator, then do scientific review and style review.
5. **Publish** as CC0 with full provenance metadata, a `provenance=ai-*` tag, and a review record. Keep these in a separate "AI-assisted" pack in the repo for easy audit and rollback.

**Rough cost and time per 100 icons** (estimates, not quotes):
- **Compute:** LLM-SVG is a few cents to roughly $0.30 per candidate set at current frontier-model API prices (check the provider's pricing page). Diffusion means renting a 24–48 GB GPU for a few hours, plus a one-off LoRA training of about 1–3 GPU-hours. **Total compute: well under $100 per 100 icons.**
- **Human time:**
  - prompting and selection ~5 min/icon
  - vector cleanup 10–30 min (simple) to 30–60 min (organic)
  - scientific review 5–10 min
  - **about 25–60 hours per 100 icons**
- People time dominates. AI saves perhaps 30–50% versus drawing from scratch for simple icons, and less for anatomy.
- **Alternative to compare:** commissioning human illustrators on a CC0 contract (no AI-policy friction for users). Budget for a freelancer's rates on a fixed style spec. Human-drawn icons are "journal-safe" everywhere.

---

## Part 3: Recommendation

**First (weeks 1–6): ingest the clean open vector sources.**
1. **TogoTV/DBCLS** (CC BY 4.0, SVG, official zip plus Commons). Reject fake SVGs that contain `<image>`.
2. **SwissBioPics** cells and **Expression Atlas anatomograms**. Both are CC BY 4.0, semantically tagged SVG, and high value for cell/tissue figures.
3. **Health Icons** (CC0) and **Arcadia organisms** (CC0; confirm the licence badge).
4. **Servier PPTX → SVG** conversion spike. If DrawingML converts cleanly, this is about 3,000 professional CC BY 4.0 icons.
5. **SciDraw** via Zenodo (check each item's licence).
6. **NIH BioArt:** email NIAID to request bulk source vectors (mostly PD). Don't scrape.
7. **Wikimedia Commons:** a curated slice only (SVG + CC0/CC BY via `haswbstatement:P275` and extmetadata, no SA/GFDL, no `<image>`).

For all of them, build an **ingestion validator** that every source must pass:
- SPDX licence ID from an allowlist
- author, source URL/DOI and required credit text
- no raster, no text, recolourable groups, perceptual-hash dedupe against the existing library

**Second: demand-driven gap analysis.** Mine PMC OA captions (bucket JSON/XML, `license_code` ∈ {cc0, by}) and in-app search logs, if opt-in, to rank missing concepts. Use paper figures **only as a demand signal and visual reference, never as icon source material.**

**Third: a small, labelled AI-assisted pack for gaps.**
- LLM-written SVG first (simplest, cleanest, compatible terms); FLUX.1-schnell/SDXL + LoRA for organic shapes.
- Mandatory two-person review.
- CC0 release with provenance metadata.
- **"Journal-safe mode" on by default** to hide AI icons.
- In parallel, consider commissioning a human illustrator for high-traffic concepts (cells, organs, mice, common lab equipment).

**Avoid**
- Extracting or tracing icons from PMC/journal figures. BioRender and other third-party art hides inside about 40k "CC BY" papers, and detection can't be made reliable.
- Recraft and Adobe Firefly outputs in the shipped library (no-training and revocability terms), FLUX.1 [dev] (non-commercial), and fine-tuning on OmniSVG's CC BY-NC-SA MMSVG data.
- NC, ND and (by default) SA licences, including OpenMoji, many Commons files and the Irving Geis PDB images.
- Imitating BioRender's or Servier's distinctive style through prompts or LoRAs. That invites claims and undermines trust.
- Shipping AI icons without visible labelling. Nature/Springer Nature's ban and Science's permission rule make silent AI content a direct risk to your users' publications.
