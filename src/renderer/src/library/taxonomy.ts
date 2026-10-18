// One browsable category tree for every icon library. Each library uses its own category
// names, so icons are sorted here by keywords in their name plus their source category.
// Rules are tried in order and the first match wins, so specific subcategories come first.

export interface SubCategory {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
  subs: SubCategory[]
}

export const CATEGORIES: Category[] = [
  {
    id: 'cells',
    name: 'Cells & organelles',
    subs: [
      { id: 'immune', name: 'Immune & blood cells' },
      { id: 'neural', name: 'Neurons & glia' },
      { id: 'epithelial', name: 'Epithelial & tissue cells' },
      { id: 'muscle', name: 'Muscle cells' },
      { id: 'stem', name: 'Stem, germ & embryo' },
      { id: 'division', name: 'Cell division' },
      { id: 'cancer', name: 'Cancer cells' },
      { id: 'plant-cells', name: 'Plant & algal cells' },
      { id: 'organelles', name: 'Organelles' },
      { id: 'cytoskeleton', name: 'Cytoskeleton & matrix' },
      { id: 'generic-cells', name: 'Cells (general)' }
    ]
  },
  {
    id: 'molecules',
    name: 'Proteins & molecules',
    subs: [
      { id: 'antibodies', name: 'Antibodies' },
      { id: 'receptors', name: 'Receptors & ligands' },
      { id: 'channels', name: 'Channels & transporters' },
      { id: 'enzymes', name: 'Enzymes' },
      { id: 'signalling', name: 'Cytokines & signalling' },
      { id: 'proteins', name: 'Proteins (general)' },
      { id: 'amino-acids', name: 'Amino acids & peptides' },
      { id: 'lipids', name: 'Lipids & carbohydrates' },
      { id: 'small-molecules', name: 'Small molecules & drugs' }
    ]
  },
  {
    id: 'genetics',
    name: 'DNA, RNA & genetics',
    subs: [
      { id: 'dna', name: 'DNA & chromosomes' },
      { id: 'rna', name: 'RNA' },
      { id: 'plasmids', name: 'Plasmids & vectors' },
      { id: 'editing', name: 'Gene editing & sequencing' }
    ]
  },
  {
    id: 'membranes',
    name: 'Membranes',
    subs: [{ id: 'membranes', name: 'Membranes & bilayers' }]
  },
  {
    id: 'microbes',
    name: 'Microbes & parasites',
    subs: [
      { id: 'viruses', name: 'Viruses' },
      { id: 'bacteria', name: 'Bacteria' },
      { id: 'fungi', name: 'Fungi & yeast' },
      { id: 'parasites', name: 'Parasites & protists' }
    ]
  },
  {
    id: 'organisms',
    name: 'Animals & plants',
    subs: [
      { id: 'rodents', name: 'Mice & rats' },
      { id: 'mammals', name: 'Other mammals' },
      { id: 'birds', name: 'Birds' },
      { id: 'fish', name: 'Fish' },
      { id: 'amphibians', name: 'Amphibians & reptiles' },
      { id: 'invertebrates', name: 'Insects & invertebrates' },
      { id: 'plants', name: 'Plants & agriculture' }
    ]
  },
  {
    id: 'anatomy',
    name: 'Human anatomy',
    subs: [
      { id: 'people', name: 'People & body' },
      { id: 'brain', name: 'Brain & nervous system' },
      { id: 'heart', name: 'Heart & blood vessels' },
      { id: 'lungs', name: 'Lungs & airway' },
      { id: 'digestive', name: 'Digestive system' },
      { id: 'urinary', name: 'Kidney & urinary' },
      { id: 'reproductive', name: 'Reproductive system' },
      { id: 'musculoskeletal', name: 'Bones, joints & muscle' },
      { id: 'skin', name: 'Skin' },
      { id: 'senses', name: 'Eye, ear & teeth' },
      { id: 'blood', name: 'Blood & lymph' },
      { id: 'tissues', name: 'Tissues & organs (general)' }
    ]
  },
  {
    id: 'lab',
    name: 'Lab equipment',
    subs: [
      { id: 'tubes', name: 'Tubes & vials' },
      { id: 'glassware', name: 'Flasks, beakers & bottles' },
      { id: 'pipettes', name: 'Pipettes & syringes' },
      { id: 'plates', name: 'Plates, dishes & culture' },
      { id: 'instruments', name: 'Instruments & machines' },
      { id: 'imaging', name: 'Microscopes & imaging' },
      { id: 'safety', name: 'Safety & PPE' },
      { id: 'lab-other', name: 'Other lab items' }
    ]
  },
  {
    id: 'clinical',
    name: 'Medical & clinical',
    subs: [
      { id: 'drugs', name: 'Medicines & vaccines' },
      { id: 'devices', name: 'Medical devices' },
      { id: 'clinical-people', name: 'Patients & clinicians' },
      { id: 'conditions', name: 'Conditions & diagnostics' },
      { id: 'public-health', name: 'Hospitals & public health' }
    ]
  },
  {
    id: 'chemistry',
    name: 'Chemistry',
    subs: [
      { id: 'compounds', name: 'Compounds & structures' },
      { id: 'models', name: 'Molecular models' },
      { id: 'nano', name: 'Nanoparticles & materials' }
    ]
  },
  {
    id: 'symbols',
    name: 'Symbols & data',
    subs: [
      { id: 'arrows', name: 'Arrows' },
      { id: 'graphs', name: 'Graphs & charts' },
      { id: 'computing', name: 'Computers & data' },
      { id: 'signs', name: 'Signs & symbols' },
      { id: 'backgrounds', name: 'Backgrounds' }
    ]
  },
  {
    id: 'pictograms',
    name: 'Simple pictograms',
    subs: [
      { id: 'pg-body', name: 'Body' },
      { id: 'pg-lab', name: 'Lab & science' },
      { id: 'pg-medical', name: 'Medical' },
      { id: 'pg-nature', name: 'Nature & organisms' },
      { id: 'pg-charts', name: 'Charts & measuring' }
    ]
  }
]

type Rule = [string, RegExp]

const w = (words: string) => new RegExp(`\\b(${words})`, 'i')

/** Keyword rules on "name + source category", most specific first. Value is "category/sub". */
const RULES: Rule[] = [
  ['symbols/arrows', w('arrow')],
  ['lab/tubes', w('tube\\b|tubes\\b|microtube|vial|eppendorf|falcon tube|cuvette|cryovial|glass slide|glass-slide|coverslip')],
  ['lab/glassware', w('flask|beaker|bottle|erlenmeyer|graduated cylinder|funnel|burette|condenser|reagent')],
  ['lab/pipettes', w('pipet|syringe|needle|dropper|multichannel')],
  ['lab/plates', w('petri|well plate|well-plate|multiwell|\\d+-?well|culture dish|culture flask|transwell|colony|colonies')],
  ['molecules/antibodies', w('antibod|immunoglobulin|igg|igm|iga\\b|ige\\b|fab\\b|fc fragment|nanobod|scfv')],
  ['membranes/membranes', w('membrane|bilayer|lipid raft|liposome|micelle')],
  ['microbes/viruses', w('virus|viral|virion|phage|capsid|sars|covid|hiv\\b|influenza|coronavir')],
  ['microbes/bacteria', w('bacteri|bacillus|coccus|e\\. ?coli|escherichia|salmonella|staphyl|streptoc|mycobact|pseudomonas|vibrio|microbiome|biofilm|caulobacter')],
  ['microbes/fungi', w('fung|yeast|mushroom|mould|mold\\b|candida|aspergill|saccharomyces|pombe|neurospora')],
  ['microbes/parasites', w('parasit|plasmodium|malaria|trypanosom|toxoplasm|leishman|giardia|amoeb|protist|tetrahymena|dictyostel|chlamydomonas|helminth|tapeworm|schistosom')],
  ['organisms/rodents', w('mouse|mice|rat\\b|rats\\b|rodent|hamster|guinea pig|mus musculus|rattus|vole|gerbil')],
  ['organisms/fish', w('fish|zebrafish|medaka|danio|salmon|killifish|stickleback|lamprey|shark')],
  ['organisms/birds', w('bird|avocet|chicken|chick\\b|finch|pigeon|duck|quail|gallus|hen\\b|owl|parrot')],
  ['organisms/amphibians', w('frog|xenopus|axolotl|salamander|toad|reptile|lizard|anole|turtle|snake|newt|gecko')],
  ['organisms/invertebrates', w('drosophila|fruit ?fly|fly\\b|flies|cricket|insect|mosquito|bee\\b|honey ?bee|ant\\b|beetle|moth|butterfly|tick\\b|spider|worm|nematode|elegans|planari|hydra|sea urchin|sea anemone|octopus|squid|snail|aphid|daphnia|crabs?\\b|shrimp|jellyfish|coral|sponge|ciona|sea hare|arthropod|invertebrate')],
  ['organisms/mammals', w('monkey|macaque|primate|chimp|marmoset|ape\\b|pig\\b|swine|cow\\b|cattle|bovine|sheep|goat|horse|dog\\b|canine|cat\\b|feline|rabbit|ferret|bat\\b|opossum|platypus|dolphin|whale|mammal|elephant|camel|deer|bear\\b|mole-rat')],
  ['organisms/plants', w('plant|leaf|leaves|arabidopsis|rice|maize|corn|wheat|barley|tobacco|tomato|soy|seed|flower|tree|root\\b|roots\\b|algae|moss|crop|agricult|pollen|chloroplast')],
  ['cells/immune', w('t ?cell|b ?cell|t-cell|b-cell|lymphocyte|macrophage|neutrophil|monocyte|dendritic|nk cell|natural killer|mast cell|eosinophil|basophil|platelet|erythrocyte|red blood cell|white blood cell|leukocyte|plasma cell|treg|immune cell|granulocyte|megakaryocyte')],
  ['cells/neural', w('neuron|neural|nerve cell|astrocyte|microglia|oligodendrocyte|schwann|glia|synapse|axon|dendrite|motor neuron')],
  ['cells/muscle', w('myocyte|cardiomyocyte|muscle cell|myoblast|myotube|muscle fib')],
  ['cells/stem', w('stem cell|ipsc|embryo|blastocyst|zygote|oocyte|egg cell|sperm|ovum|morula|gastrula|germ cell|organoid|8-cell|2-cell|4-cell')],
  ['cells/division', w('mitosis|meiosis|cytokinesis|cell division|cell cycle|prophase|metaphase|anaphase|telophase|spindle')],
  ['cells/cancer', w('cancer|tumou?r|metasta|oncol|carcinoma|leukemi|lymphoma|melanoma|apoptosis')],
  ['cells/cytoskeleton', w('actin|microtubule|tubulin|filament|cytoskelet|collagen|extracellular matrix|\\becm\\b|integrin|fibronectin|keratin')],
  ['cells/organelles', w('mitochondri|nucleus|nucleolus|ribosome|golgi|endoplasmic|\\ber\\b|lysosome|endosome|peroxisome|vesicle|vacuole|centriole|centrosome|cilium|cilia|flagell|chromatin|exosome|autophag|proteasome|organelle|cell element')],
  ['cells/epithelial', w('epitheli|endotheli|fibroblast|hepatocyte|keratinocyte|adipocyte|osteoblast|osteoclast|chondrocyte|enterocyte|podocyte|goblet|beta cell|islet|melanocyte|pneumocyte')],
  ['genetics/plasmids', w('plasmid|vector\\b|cloning|lentivir|aav\\b|transfection')],
  ['genetics/editing', w('crispr|cas9|cas12|guide rna|sgrna|sequenc|pcr\\b|gel electrophoresis|genom|gene editing|mutation|snp|primer|ngs\\b|nanopore|epigenet|methylation|histone')],
  ['genetics/rna', w('rna|mrna|trna|rrna|mirna|sirna|lncrna|transcript|spliceosome')],
  ['genetics/dna', w('dna|chromosome|helix|nucleotide|nucleic acid|gene\\b|genes\\b|g-quadruplex|telomere|base pair')],
  ['molecules/receptors', w('receptor|ligand|gpcr|tlr\\d|cd\\d+|mhc|hla|tcr\\b|bcr\\b|egfr|her2|insulin receptor')],
  ['molecules/channels', w('channel|transporter|ion pump|proton pump|sodium pump|porin|aquaporin|exchanger|symporter|antiporter|atpase')],
  ['molecules/enzymes', w('enzyme|kinase|phosphatase|protease|polymerase|ligase|helicase|synthase|oxidase|reductase|dehydrogenase|transferase|hydrolase|isomerase|lipase|amylase|caspase|nuclease')],
  ['molecules/signalling', w('cytokine|interleukin|\\bil-?\\d|interferon|tnf|chemokine|growth factor|hormone|insulin|glucagon|signall?ing|neurotransmitter|dopamine|serotonin|complement')],
  ['molecules/amino-acids', w('amino acid|peptide|alanine|glycine|lysine|arginine|serine|cysteine|tyrosine|tryptophan|leucine|valine|proline|histidine|glutam|aspart|asparagine|methionine|phenylalanine|threonine|isoleucine')],
  ['molecules/lipids', w('lipid|fatty acid|cholesterol|phospholipid|glycan|sugar|glucose|carbohydrate|starch|cellulose|glycogen|saccharide|triglyceride|sphingo')],
  ['molecules/small-molecules', w('drug|compound|small molecule|inhibitor|metabolite|atp\\b|nadh|vitamin|antibiotic')],
  ['anatomy/brain', w('brain|cerebr|cortex|hippocamp|spinal cord|nervous system|neuroanatom|head\\b|skull|cerebellum|brainstem')],
  ['anatomy/heart', w('heart|cardi|artery|arteries|vein|vessel|aorta|capillar|vascul|circulat')],
  ['anatomy/lungs', w('lung|airway|trachea|bronch|alveol|respirat|pulmonar|diaphragm')],
  ['anatomy/digestive', w('stomach|intestin|gut\\b|colon\\b|colonic|liver|hepat|pancrea|esophag|oesophag|digest|bowel|gallbladder|spleen|appendix|mouth|tongue')],
  ['anatomy/urinary', w('kidney|renal|nephron|bladder|urinar|urethra|ureter')],
  ['anatomy/reproductive', w('uterus|ovary|ovaries|testis|testes|prostate|placenta|pregnan|fetus|foetus|vagina|penis|reproduct|breast|mammary|contracept|menstru')],
  ['anatomy/musculoskeletal', w('bone|skeleton|skelet|joint|knee|hip\\b|spine|vertebra|cartilage|muscle|tendon|femur|pelvis|ligament|arm\\b|leg\\b|hand\\b|foot\\b')],
  ['anatomy/skin', w('skin|derm|hair|wound|epiderm|nail')],
  ['anatomy/senses', w('eye|retina|cornea|lens\\b|ear\\b|cochlea|tooth|teeth|dental|nose|olfact|vision|hearing')],
  ['anatomy/blood', w('blood|lymph|thymus|bone marrow|plasma\\b|serum')],
  ['lab/plates', w('plate\\b|dish\\b|cell culture|incubat')],
  ['lab/imaging', w('microscop|confocal|camera|imaging|x-?ray|mri\\b|ct scan|ultrasound|optic|laser|lens|fluoresc')],
  ['lab/instruments', w('centrifuge|thermocycler|pcr machine|sequencer|spectro|cytomet|facs|hplc|mass spec|shaker|vortex|balance|scale\\b|machine|robot|instrument|freezer|fridge|refrigerat|oven|autoclave|hood|bioreactor|electrophoresis|blotting|western')],
  ['lab/safety', w('safety|hazard|biohazard|toxic|flammable|corrosive|radioact|warning|ppe|glove|goggles|mask|lab coat|gown|face shield')],
  ['clinical/drugs', w('pill|tablet|capsule|medic(ine|ation)|vaccine|vaccin|injection|ampoule|iv bag|infusion|prescription|pharma')],
  ['clinical/clinical-people', w('doctor|nurse|patient|clinician|physician|surgeon|health worker|caregiver')],
  ['clinical/devices', w('stethoscope|thermometer|blood pressure|wheelchair|crutch|bandage|scalpel|stent|catheter|inhaler|glucometer|pacemaker|defibrillat|device|bed\\b|stretcher|ventilator|oxygen concentrator|oxygen tank')],
  ['clinical/public-health', w('hospital|clinic|ambulance|pharmacy|public health|epidemi|outbreak|quarantine|community|vehicle')],
  ['clinical/conditions', w('disease|syndrome|diabet|fever|infection|pain|injur|fracture|symptom|diagnos|test\\b|tests\\b|rapid test|malnutrition|obesity|allerg')],
  ['anatomy/people', w('person|people|human|man\\b|woman|child|baby|infant|adult|elderly|body\\b|figure|silhouette of a person|family|group of')],
  ['chemistry/nano', w('nanoparticle|nano|quantum dot|gold particle|graphene|carbon nanotube|polymer|hydrogel|material')],
  ['chemistry/models', w('model kit|ball-and-stick|space-filling|molecular model|atom|orbital|crystal')],
  ['chemistry/compounds', w('chem|formula|benzene|ion\\b|acid\\b|base\\b|salt|solvent|ethanol|methanol|water molecule|h2o|oxygen molecule')],
  ['symbols/graphs', w('graph\\b|graphs\\b|chart|plot\\b|histogram|heatmap|scatter|bar ?graph')],
  ['symbols/computing', w('computer|laptop|server|database|cloud|machine learning|neural network|algorithm|code|data\\b|file\\b|monitor|keyboard|python|jupyter|tensorflow|pytorch|bioinformat|chip\\b|gpu')],
  ['symbols/backgrounds', w('background')],
  ['symbols/signs', w('symbol|sign\\b|check|cross|plus|minus|star|lightning|question|exclamation|number|letter|shape|emoji|face\\b')]
]

/** Fallbacks by library + source category when no keyword matched. */
const SOURCE_DEFAULTS: Record<string, string> = {
  'bioicons:Human_physiology': 'anatomy/tissues',
  'bioicons:Animals': 'organisms/mammals',
  'bioicons:Blood_Immunology': 'cells/immune',
  'bioicons:General_items': 'lab/lab-other',
  'bioicons:Lab_apparatus': 'lab/lab-other',
  'bioicons:Microbiology': 'microbes/bacteria',
  'bioicons:Intracellular_components': 'cells/organelles',
  'bioicons:Chemistry': 'chemistry/compounds',
  'bioicons:Cell_membrane': 'membranes/membranes',
  'bioicons:Nucleic_acids': 'genetics/dna',
  'bioicons:Genetics': 'genetics/editing',
  'bioicons:Plants_Algae': 'organisms/plants',
  'bioicons:Amino-Acids': 'molecules/amino-acids',
  'bioicons:Parasites': 'microbes/parasites',
  'bioicons:Receptors_channels': 'molecules/receptors',
  'bioicons:Scientific_graphs': 'symbols/graphs',
  'bioicons:Tissues': 'anatomy/tissues',
  'bioicons:Cell_culture': 'lab/plates',
  'bioicons:Safety_symbols': 'lab/safety',
  'bioicons:Oncology': 'cells/cancer',
  'bioicons:Machine_Learning': 'symbols/computing',
  'bioicons:Cell_types': 'cells/generic-cells',
  'bioicons:People-Other': 'anatomy/people',
  'bioicons:Viruses': 'microbes/viruses',
  'bioicons:Chemo-_and_Bioinformatics': 'symbols/computing',
  'bioicons:Molecular_modelling': 'chemistry/models',
  'bioicons:Procedures': 'clinical/devices',
  'bioicons:Imaging': 'lab/imaging',
  'bioicons:Computer_hardware': 'symbols/computing',
  'bioicons:Cell_lines': 'cells/generic-cells',
  'bioicons:Genomics': 'genetics/editing',
  'bioicons:Nanotechnology': 'chemistry/nano',
  'bioicons:Peptides': 'molecules/amino-acids',
  'bioicons:Epigenetics': 'genetics/editing',
  'bioicons:Extracellular_matrix': 'cells/cytoskeleton',
  'bioicons:Molecular_Biology': 'genetics/dna',
  'bioicons:Neuroscience': 'cells/neural',
  'reactome:Proteins': 'molecules/proteins',
  'reactome:Compounds': 'molecules/small-molecules',
  'reactome:Cell elements': 'cells/organelles',
  'reactome:Cell types': 'cells/generic-cells',
  'reactome:Receptors': 'molecules/receptors',
  'reactome:Human tissues': 'anatomy/tissues',
  'reactome:Therapeutics': 'molecules/small-molecules',
  'reactome:Transporters': 'molecules/channels',
  'reactome:Backgrounds': 'symbols/backgrounds',
  'reactome:Arrows': 'symbols/arrows',
  'phylopic:Mammals': 'organisms/mammals',
  'phylopic:Invertebrates': 'organisms/invertebrates',
  'phylopic:Fungi & protists': 'microbes/fungi',
  'phylopic:Fish': 'organisms/fish',
  'phylopic:Bacteria': 'microbes/bacteria',
  'phylopic:Plants': 'organisms/plants',
  'phylopic:Amphibians & reptiles': 'organisms/amphibians',
  'phylopic:Birds': 'organisms/birds',
  'swissbiopics:Animal cells': 'cells/generic-cells',
  'swissbiopics:Fungal cells': 'microbes/fungi',
  'swissbiopics:Protist cells': 'microbes/parasites',
  'swissbiopics:Plant & algal cells': 'cells/plant-cells',
  'swissbiopics:Bacterial cells': 'microbes/bacteria',
  'scidraw:Cells': 'cells/generic-cells',
  'scidraw:Mice': 'organisms/rodents',
  'scidraw:Rats': 'organisms/rodents',
  'scidraw:Fish': 'organisms/fish',
  'scidraw:Drosophila': 'organisms/invertebrates',
  'scidraw:Human': 'anatomy/people',
  'scidraw:Birds': 'organisms/birds',
  'scidraw:Other': 'lab/lab-other',
  'anatomograms:Animals': 'organisms/mammals',
  'anatomograms:Plants': 'organisms/plants',
  'anatomograms:Human': 'anatomy/people',
  'biodraws:Nervous system': 'cells/neural',
  'biodraws:Immunology': 'cells/immune',
  'biodraws:Amino Acids': 'molecules/amino-acids',
  'biodraws:Cell culture': 'lab/plates',
  'biodraws:Cells': 'cells/generic-cells',
  'biodraws:DNA': 'genetics/dna',
  'biodraws:Embryology': 'cells/stem',
  'biodraws:Eye': 'anatomy/senses',
  'biodraws:Protein Structure': 'molecules/proteins',
  'biodraws:Membrane protein': 'molecules/channels',
  'biodraws:Transporter': 'molecules/channels',
  'biodraws:Enzyme': 'molecules/enzymes',
  'biodraws:Glucose': 'molecules/lipids',
  'arcadia:Silhouettes': 'organisms/mammals',
  'arcadia:Tricolor': 'organisms/mammals'
}

/** Health Icons groups (e.g. "Devices (outline)") and their default placement. */
const HEALTH_GROUPS: Record<string, string> = {
  Symbols: 'symbols/signs',
  People: 'clinical/clinical-people',
  Devices: 'clinical/devices',
  Conditions: 'clinical/conditions',
  Body: 'anatomy/people',
  Typography: 'symbols/signs',
  Specialties: 'clinical/public-health',
  Diagnostics: 'clinical/conditions',
  Objects: 'lab/lab-other',
  Emotions: 'symbols/signs',
  Places: 'clinical/public-health',
  Nutrition: 'clinical/public-health',
  Shapes: 'symbols/signs',
  Contraceptives: 'clinical/drugs',
  Ppe: 'lab/safety',
  Graphs: 'symbols/graphs',
  Medications: 'clinical/drugs',
  Vehicles: 'clinical/public-health',
  Blood: 'anatomy/blood',
  Zoonoses: 'organisms/mammals',
  Exercise: 'anatomy/people'
}

// Iconify pictograms are grouped by the term they were found with. Some terms are mostly
// app-interface icons (a computer mouse, "show password" eyes, "like" hearts) and are hidden.
const PICTOGRAM_GROUPS: Record<string, string | null> = {
  Mouse: null,
  Eye: null,
  Heart: null,
  Ear: null,
  Scale: 'pg-charts',
  Chart: 'pg-charts',
  Thermometer: 'pg-charts',
  Hospital: 'pg-medical',
  Medical: 'pg-medical',
  Pill: 'pg-medical',
  Syringe: 'pg-medical',
  Vaccine: 'pg-medical',
  Doctor: 'pg-medical',
  Patient: 'pg-medical',
  Leaf: 'pg-nature',
  Plant: 'pg-nature',
  Seed: 'pg-nature',
  Fish: 'pg-nature',
  Mushroom: 'pg-nature',
  Fungus: 'pg-nature',
  Rat: 'pg-nature',
  Egg: 'pg-nature',
  Virus: 'pg-nature',
  Bacteria: 'pg-nature'
}
const PICTOGRAM_BODY = /^(Brain|Bone|Tooth|Lungs|Skeleton|Muscle|Kidney|Stomach|Intestine|Liver|Organ|Blood|Droplet|Sperm)$/

export interface Placement {
  cat: string
  sub: string
}

/** Where an icon belongs in the shared tree, or null to hide it from browsing. */
export function classify(packId: string, name: string, sourceCategory: string): Placement | null {
  if (packId === 'iconify-science') {
    const g = sourceCategory in PICTOGRAM_GROUPS ? PICTOGRAM_GROUPS[sourceCategory] : PICTOGRAM_BODY.test(sourceCategory) ? 'pg-body' : 'pg-lab'
    return g ? { cat: 'pictograms', sub: g } : null
  }
  const text = `${name} ${sourceCategory.replace(/[_-]+/g, ' ')}`
  const health = packId === 'healthicons'
  for (const [target, re] of RULES) {
    // Health Icons tags mention many loosely related words; only trust body/clinical/lab ones.
    if (health && !/^(anatomy|clinical|lab)\//.test(target)) continue
    if (re.test(text)) {
      const [cat, sub] = target.split('/')
      return { cat, sub }
    }
  }
  const fallback =
    SOURCE_DEFAULTS[`${packId}:${sourceCategory}`] ?? (packId === 'healthicons' ? HEALTH_GROUPS[sourceCategory.replace(/ \((filled|outline)\)$/, '')] : undefined)
  const [cat, sub] = (fallback ?? 'symbols/signs').split('/')
  return { cat, sub }
}
