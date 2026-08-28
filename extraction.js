window.Shrinkhala = window.Shrinkhala || {};
window.Shrinkhala.Extraction = (function() {
    const DOCUMENT_TYPES = [
        {value: 'fir', label: 'FIR (First Information Report)'},
        {value: 'seizure_memo', label: 'Seizure Memo'},
        {value: 'fsl_report', label: 'FSL Report (Forensic Lab)'},
        {value: 'witness_statement', label: 'Witness Statement (Sec 161)'},
        {value: 'charge_sheet', label: 'Charge Sheet'},
        {value: 'panchnama', label: 'Panchnama'}
    ];

    function extractEntities(text, docType) {
        const entities = {
            sealNumbers: [], weights: [], dates: [], times: [], sections: [],
            witnesses: [], locations: [], gps: [], officers: [], substances: [],
            accused: [], victims: [], caseNumber: null
        };

        const lines = text.split('\n');
        
        let match;
        // Seal numbers
        const sealRegex = /S-\d{4}-\d{4}-\d{3}/g;
        while ((match = sealRegex.exec(text)) !== null) {
            entities.sealNumbers.push({ value: match[0], source: 'Document text' });
        }

        // Weights
        const weightRegex = /(\d+\.\d+)\s*(grams?|g|kg)/gi;
        while ((match = weightRegex.exec(text)) !== null) {
            entities.weights.push({ value: parseFloat(match[1]), unit: match[2], grossOrNet: 'unknown', source: 'Document text' });
        }

        // Times
        const timeRegex = /\d{1,2}:\d{2}\s*(hrs|hours)?/gi;
        while ((match = timeRegex.exec(text)) !== null) {
            entities.times.push({ value: match[0], source: 'Document text' });
        }
        
        // Sections
        const sectionRegex = /Section\s+[\d]+[a-z]?(?:\([a-z0-9]+\))?\s+(?:NDPS|BNSS|BNS|CrPC|IPC)/gi;
        while ((match = sectionRegex.exec(text)) !== null) {
            entities.sections.push({ value: match[0], source: 'Document text' });
        }

        // Case Number
        const caseRegex = /(?:Case|FIR)\s*(?:No\.?:?)\s*([\w\/]+)/i;
        if ((match = caseRegex.exec(text)) !== null) {
            entities.caseNumber = match[1];
        }

        // GPS
        const gpsRegex = /(\d+\.\d+)°?\s*[NS],?\s*(\d+\.\d+)°?\s*[EW]/g;
        while ((match = gpsRegex.exec(text)) !== null) {
            entities.gps.push({ lat: parseFloat(match[1]), lng: parseFloat(match[2]), source: 'Document text' });
        }

        // Mock more specific extraction based on simple heuristics for the demo
        if (text.includes('Gross Weight')) {
            const grossMatch = /Gross Weight[\s\w:]*(\d+\.\d+)\s*grams?/i.exec(text);
            if (grossMatch) entities.weights.push({ value: parseFloat(grossMatch[1]), unit: 'grams', grossOrNet: 'gross', source: 'Document text' });
        }
        if (text.includes('Net Weight')) {
            const netMatch = /Net Weight[\s\w:]*(\d+\.\d+)\s*grams?/i.exec(text);
            if (netMatch) entities.weights.push({ value: parseFloat(netMatch[1]), unit: 'grams', grossOrNet: 'net', source: 'Document text' });
        }

        return entities;
    }

    function mockExtractFromFile(file, docType) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const entities = extractEntities(content, docType);
                resolve({ content, entities });
            };
            if (file.type.startsWith('text')) {
                reader.readAsText(file);
            } else {
                resolve({ content: 'Document processed via OCR simulation', entities: extractEntities('Document processed via OCR simulation', docType) });
            }
        });
    }

    function applyRedaction(text, role) {
        let processed = text;
        if (role === 'defense') {
            processed = processed.replace(/(Witness:\s*)(.*)/gi, '$1█████ [REDACTED]');
            processed = processed.replace(/(Statement of:\s*)(.*)/gi, '$1█████ [REDACTED]');
            processed = processed.replace(/Aadhaar:\s*[A-Z0-9-]{12,14}/gi, 'Aadhaar: █████ [REDACTED]');
            processed = processed.replace(/R\/o:\s*.*/gi, 'R/o: █████ [REDACTED]');
        } else if (role === 'prosecutor') {
            processed = processed.replace(/Aadhaar:\s*[A-Z0-9-]{12,14}/gi, 'Aadhaar: █████ [REDACTED]');
        }
        return processed;
    }

    function generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getDemoDocuments(caseId) {
        const docs = [
            {
                id: generateUuid(),
                name: 'FIR_0042_2026.pdf',
                type: 'fir',
                typeLabel: 'FIR',
                caseId: caseId,
                content: `FIRST INFORMATION REPORT
FIR No: 0042/2026
Police Station: Sadar, Gurgaon
Date: 15-Aug-2026
Time: 13:45 hrs

Under Sections: Section 21(b) NDPS Act, 1985
                Section 42 NDPS Act (Search of Persons)

Complainant: Sub-Inspector Rajesh Kumar (Badge #4521)
Accused: Arjun Mehra, S/o Vikram Mehra, R/o 45-B, Sector 14, Gurgaon

Brief Facts:
On 15-Aug-2026 at approximately 13:30 hrs, acting on reliable information, the complainant along with HC Suresh Yadav proceeded to the intersection of MG Road and Sohna Road, Sector 14, Gurgaon. The accused Arjun Mehra was found in possession of a brown powdery substance suspected to be Heroin (Diacetylmorphine). The substance was weighed at the spot and found to be 5.2 grams. The substance was sealed with seal no. S-2026-0815-001 in the presence of independent witnesses.

Witness: Ravi Sharma (Aadhaar: XXXX-XXXX-4523)
Witness: Meena Devi (Aadhaar: XXXX-XXXX-7891)

GPS Coordinates: 28.4595°N, 77.0266°E`,
                hash: '',
                entities: {
                    sealNumbers: [{value: 'S-2026-0815-001', source: 'Line 14'}],
                    weights: [{value: 5.2, unit: 'grams', grossOrNet: 'unknown', source: 'Line 13'}],
                    dates: [{value: '15-Aug-2026', source: 'Line 4'}],
                    times: [{value: '13:45 hrs', source: 'Line 5'}],
                    sections: [{value: 'Section 21(b) NDPS Act', source: 'Line 7'}],
                    witnesses: [{name: 'Ravi Sharma', location: '', time: '', source: 'Line 16'}, {name: 'Meena Devi', location: '', time: '', source: 'Line 17'}],
                    locations: [], gps: [{lat: 28.4595, lng: 77.0266, source: 'Line 20'}], officers: [{name: 'Rajesh Kumar', rank: 'SI', badge: '4521', source: 'Line 10'}], substances: [{name: 'Heroin', source: 'Line 13'}], accused: [{name: 'Arjun Mehra', source: 'Line 11'}], victims: [], caseNumber: '0042/2026'
                },
                uploadedAt: new Date().toISOString()
            },
            {
                id: generateUuid(),
                name: 'Seizure_Memo_S2026.pdf',
                type: 'seizure_memo',
                typeLabel: 'Seizure Memo',
                caseId: caseId,
                content: `SEIZURE MEMORANDUM
Case No: NDPS/GRG/42/2026
Date: 15-Aug-2026
Time of Seizure: 14:00 hrs
Location: Intersection of MG Road & Sohna Road, Sector 14, Gurgaon

Seizing Officer: SI Rajesh Kumar (Badge #4521)

Items Seized:
1. Brown powdery substance (suspected Heroin)
   - Gross Weight: 5.2 grams
   - Net Weight: 5.0 grams
   - Seal Number: S-2026-0815-001
   - Packaging: Transparent polythene pouch

2. Mobile Phone (Samsung Galaxy M31)
   - IMEI: 356XXXXXXX001
   - Seal Number: S-2026-0815-002

Independent Witnesses Present:
- Ravi Sharma, R/o 12 Market Road, Sector 14, Gurgaon
  Signed at: 14:30 hrs at Sector 14, Gurgaon
- Meena Devi, R/o 78 Main Street, Sector 14, Gurgaon
  Signed at: 14:30 hrs at Sector 14, Gurgaon

GPS: 28.4595°N, 77.0266°E`,
                hash: '',
                entities: {
                    sealNumbers: [{value: 'S-2026-0815-001', source: 'Line 13'}, {value: 'S-2026-0815-002', source: 'Line 18'}],
                    weights: [{value: 5.2, unit: 'grams', grossOrNet: 'gross', source: 'Line 11'}, {value: 5.0, unit: 'grams', grossOrNet: 'net', source: 'Line 12'}],
                    dates: [], times: [], sections: [],
                    witnesses: [{name: 'Ravi Sharma', location: 'Sector 14, Gurgaon', time: '14:30 hrs', source: 'Line 21'}, {name: 'Meena Devi', location: 'Sector 14, Gurgaon', time: '14:30 hrs', source: 'Line 24'}],
                    locations: [], gps: [{lat: 28.4595, lng: 77.0266, source: 'Line 26'}], officers: [{name: 'Rajesh Kumar', rank: 'SI', badge: '4521', source: 'Line 7'}], substances: [{name: 'Heroin', source: 'Line 10'}], accused: [], victims: [], caseNumber: 'NDPS/GRG/42/2026'
                },
                uploadedAt: new Date().toISOString()
            },
            {
                id: generateUuid(),
                name: 'FSL_Report_1247.pdf',
                type: 'fsl_report',
                typeLabel: 'FSL Report',
                caseId: caseId,
                content: `FORENSIC SCIENCE LABORATORY REPORT
Report No: FSL/CHD/2026/08/1247
Laboratory: Central Forensic Science Laboratory, Chandigarh
Date of Report: 20-Aug-2026

Reference: Case No. NDPS/GRG/42/2026
Requesting Authority: SHO, PS Sadar, Gurgaon
Date of Receipt: 16-Aug-2026

Exhibit Details:
Exhibit A: Brown powdery substance in sealed packet
- Seal Number: S-2026-0815-001
- Seal Condition: Intact
- Gross Weight on Receipt: 5.8 grams
- Net Weight on Receipt: 5.6 grams

Analysis Results:
- Test Applied: TLC, GC-MS, Color Reagent Test (Marquis)
- Result: POSITIVE for Diacetylmorphine (Heroin)
- Purity: 42%

Conclusion: The exhibit contains Heroin (Diacetylmorphine) as defined under the NDPS Act, 1985.

Forensic Analyst: Dr. Priya Verma, Senior Scientific Officer`,
                hash: '',
                entities: {
                    sealNumbers: [{value: 'S-2026-0815-001', source: 'Line 12'}],
                    weights: [{value: 5.8, unit: 'grams', grossOrNet: 'gross', source: 'Line 14'}, {value: 5.6, unit: 'grams', grossOrNet: 'net', source: 'Line 15'}],
                    dates: [], times: [], sections: [], witnesses: [], locations: [], gps: [], officers: [{name: 'Dr. Priya Verma', rank: 'Senior Scientific Officer', badge: '', source: 'Line 24'}], substances: [{name: 'Heroin (Diacetylmorphine)', source: 'Line 19'}], accused: [], victims: [], caseNumber: 'NDPS/GRG/42/2026'
                },
                uploadedAt: new Date().toISOString()
            },
            {
                id: generateUuid(),
                name: 'Witness_161_RaviSharma.pdf',
                type: 'witness_statement',
                typeLabel: 'Witness Statement',
                caseId: caseId,
                content: `STATEMENT UNDER SECTION 161 BNSS
Case No: NDPS/GRG/42/2026
Date: 15-Aug-2026

Statement of: Ravi Sharma
S/o: Mohan Sharma
R/o: 12 Market Road, Sector 14, Gurgaon
Age: 34 years
Occupation: Shopkeeper

Statement recorded at: Sadar Police Station, Gurgaon
Time: 14:15 hrs

I, Ravi Sharma, state that on 15-Aug-2026, I was present at the intersection of MG Road and Sohna Road when police officers approached me and requested me to act as an independent witness. I witnessed the search of one person named Arjun Mehra. A brown substance was recovered from his possession. The substance was weighed and found to be approximately 5 grams. It was sealed in my presence with seal number S-2026-0815-001.

Signature: Ravi Sharma
Time of Signature: 14:15 hrs
Location of Signature: Sadar Police Station, Gurgaon`,
                hash: '',
                entities: {
                    sealNumbers: [{value: 'S-2026-0815-001', source: 'Line 17'}],
                    weights: [{value: 5.0, unit: 'grams', grossOrNet: 'unknown', source: 'Line 16'}],
                    dates: [], times: [], sections: [],
                    witnesses: [{name: 'Ravi Sharma', location: 'Sadar Police Station, Gurgaon', time: '14:15 hrs', source: 'Line 11'}],
                    locations: [], gps: [], officers: [], substances: [], accused: [], victims: [], caseNumber: 'NDPS/GRG/42/2026'
                },
                uploadedAt: new Date().toISOString()
            }
        ];
        return docs;
    }

    return {
        DOCUMENT_TYPES,
        extractEntities,
        mockExtractFromFile,
        applyRedaction,
        getDemoDocuments
    };
})();
