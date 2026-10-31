export type RoutePath = '/' | '/vote' | '/verify' | '/admin' | '/trustee' | '/learn' | '/help';

export interface RouteMeta {
  path: RoutePath;
  navLabel: string;
  pageTitle: string;
  shortDescription: string;
}

export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    navLabel: 'Home',
    pageTitle: 'Civic Homomorphic Voting System',
    shortDescription: 'Overview of who this system is for, how ballots stay private, and how anyone can check the final math.',
  },
  {
    path: '/vote',
    navLabel: 'Vote',
    pageTitle: 'Cast Your Encrypted Ballot',
    shortDescription: 'Sign in with Internet Identity, confirm your eligibility, and encrypt a YES or NO ballot in your browser.',
  },
  {
    path: '/verify',
    navLabel: 'Verify results',
    pageTitle: 'Public Tally & Independent Verification',
    shortDescription: 'Inspect the live encrypted tally, check your ballot receipt nullifier, or audit the canister yourself with dfx.',
  },
  {
    path: '/admin',
    navLabel: 'Run an election',
    pageTitle: 'Election Administration Portal',
    shortDescription: 'Configure an election, register voter Principal IDs, and manage phase transitions from Setup to Tallying.',
  },
  {
    path: '/trustee',
    navLabel: 'Trustee',
    pageTitle: 'Threshold Key Custody & Decryption',
    shortDescription: 'Generate n-of-m Shamir key shares during Setup or combine shares in memory during Tallying to prove the final count.',
  },
  {
    path: '/learn',
    navLabel: 'Learn',
    pageTitle: 'How It Works, Security, Regulations & Privacy',
    shortDescription: 'Plain-language guides, technical cryptography details, honest limitations, regulatory considerations, and glossary.',
  },
  {
    path: '/help',
    navLabel: 'Accessibility and help',
    pageTitle: 'Accessibility, Keyboard Shortcuts & Troubleshooting',
    shortDescription: 'Keyboard navigation guide, network resilience recovery steps, accessibility statement, and usability testing protocol.',
  },
];

export type GlossaryKey = 'ciphertext' | 'nullifier' | 'trustee' | 'threshold' | 'proof';

export interface GlossaryEntry {
  term: GlossaryKey;
  label: string;
  plainDefinition: string;
  technicalNote: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  ciphertext: {
    term: 'ciphertext',
    label: 'Ciphertext',
    plainDefinition:
      'A locked digital envelope that holds your YES (1) or NO (0) vote in scrambled mathematical form so no one can read your choice while voting is open.',
    technicalNote:
      'Represented as a pair of compressed BN254 G1 elliptic-curve points (C1 = r * G, C2 = m * G + r * PK) under exponential ElGamal encryption.',
  },
  nullifier: {
    term: 'nullifier',
    label: 'Nullifier',
    plainDefinition:
      'A unique one-way receipt fingerprint created from your secret passphrase and the election ID. It stops anyone from voting twice without revealing who cast which ballot.',
    technicalNote:
      'Computed deterministically in browser WebAssembly as a 32-byte Keccak-256 hash H("nullifier" || election_id || voter_secret_scalar).',
  },
  trustee: {
    term: 'trustee',
    label: 'Trustee',
    plainDefinition:
      'A designated election guardian who holds one piece (share) of the decryption key so that no single person or administrator can unlock the tally alone.',
    technicalNote:
      'Each trustee holds a Shamir Secret Sharing evaluation (index x_i, scalar y_i = P(x_i) mod r) over the BN254 scalar field Fr.',
  },
  threshold: {
    term: 'threshold',
    label: 'Threshold (n of m)',
    plainDefinition:
      'The minimum number of trustees (n out of m total) who must bring their key shares together after voting closes to unlock the final election total.',
    technicalNote:
      'Implemented via degree-(n-1) polynomial interpolation over BN254 Fr using Lagrange basis coefficients at x = 0.',
  },
  proof: {
    term: 'proof',
    label: 'Zero-Knowledge Proof',
    plainDefinition:
      'A mathematical check that proves a ballot contains a valid 0 or 1 choice—or that the final tally was unlocked honestly—without revealing the underlying secret.',
    technicalNote:
      'Ballots use a 1-out-of-2 disjunctive Chaum-Pedersen sigma protocol; tally decryption uses a non-interactive Fiat-Shamir Chaum-Pedersen DLEQ proof.',
  },
};

export interface ScreenOrientation {
  whereAmI: string;
  whatCanIDoNow: string;
  whatHappensNext: string;
  whatIfSomethingGoesWrong: string;
}

export type WalkthroughRole = 'voter' | 'observer' | 'admin' | 'trustee';

export interface WalkthroughStep {
  stepNumber: number;
  title: string;
  plainSummary: string;
  actionHint: string;
  devicePrivacyNote?: {
    leavesDevice: string[];
    neverLeavesDevice: string[];
  };
}

export const ROLE_WALKTHROUGHS: Record<
  WalkthroughRole,
  {
    roleTitle: string;
    roleSubtitle: string;
    targetRoute: RoutePath;
    steps: WalkthroughStep[];
  }
> = {
  voter: {
    roleTitle: 'Voter Walkthrough (6 Steps)',
    roleSubtitle: 'How to cast an encrypted ballot and verify it was counted without revealing your vote.',
    targetRoute: '/vote',
    steps: [
      {
        stepNumber: 1,
        title: '1. Sign in with Internet Identity',
        plainSummary:
          'Click "Sign In (Internet Identity)" in the top navigation bar. Internet Identity gives you a pseudonymous Principal ID for this app without using passwords or email addresses.',
        actionHint: 'After signing in, your Principal ID appears in the top bar so you can copy it for voter registration.',
      },
      {
        stepNumber: 2,
        title: '2. Confirm your voter eligibility',
        plainSummary:
          'When you open the Vote page (/vote), the app automatically asks the canister if your Principal ID is on the registered voter list and checks that the election is in the Voting phase.',
        actionHint: 'If your Principal is not registered yet, share your Principal ID with the election administrator during the Setup phase.',
      },
      {
        stepNumber: 3,
        title: '3. Enter your secret passphrase and choose YES or NO',
        plainSummary:
          'Enter a high-entropy secret passphrase (at least 8 characters) and select either YES (1) or NO (0). Your passphrase is used locally in your browser to derive your one-time ballot nullifier.',
        actionHint: 'Your secret passphrase is cleared automatically if you close the tab or leave the page.',
      },
      {
        stepNumber: 4,
        title: '4. Review what leaves your device vs. what stays private',
        plainSummary:
          'Before you confirm submission, review the privacy boundary below. Your browser encrypts your vote inside a local WebAssembly module before any network call is made.',
        actionHint: 'Click "Encrypt & Preview Ballot" or "Submit Encrypted Ballot" to review the confirmation dialog.',
        devicePrivacyNote: {
          leavesDevice: [
            'Encrypted ballot ciphertext (two elliptic-curve points C1, C2 that hide your 0 or 1 choice)',
            'Zero-knowledge range proof (proves the ciphertext encrypts 0 or 1 without revealing which one)',
            '32-byte nullifier hash (one-way receipt fingerprint that blocks double voting)',
          ],
          neverLeavesDevice: [
            'Your plaintext vote choice (0 for NO or 1 for YES)',
            'Your secret passphrase and derived scalar',
            'The random encryption blinding factor r used to lock your ballot',
          ],
        },
      },
      {
        stepNumber: 5,
        title: '5. Submit your ballot and save your nullifier receipt',
        plainSummary:
          'Confirm submission in the dialog. The canister verifies your zero-knowledge range proof on-chain, adds your encrypted ballot to the running homomorphic sum, and returns your 32-byte nullifier receipt.',
        actionHint: 'Copy or save the 64-character hex nullifier receipt shown in the confirmation banner.',
      },
      {
        stepNumber: 6,
        title: '6. Verify your ballot was recorded on the Verify page',
        plainSummary:
          'Go to "Verify results" (/verify) and paste your 64-character hex nullifier receipt into the Nullifier Lookup box, or run dfx canister call from your terminal to confirm the canister recorded your ballot.',
        actionHint: 'Anyone can verify that a nullifier is included in the tally without learning how you voted.',
      },
    ],
  },
  observer: {
    roleTitle: 'Public Observer Walkthrough (4 Steps)',
    roleSubtitle: 'How to audit the encrypted tally, check a ballot receipt, and verify the final proof yourself.',
    targetRoute: '/verify',
    steps: [
      {
        stepNumber: 1,
        title: '1. Inspect the current election phase and schedule',
        plainSummary:
          'Open "Verify results" (/verify) to view the election title, administrator Principal, current lifecycle phase (Setup, Voting, Tallying, or Complete), and deadlines in your local timezone (hover or focus for UTC).',
        actionHint: 'No sign-in is required to observe or audit the election.',
      },
      {
        stepNumber: 2,
        title: '2. Check a voter nullifier receipt',
        plainSummary:
          'Paste any 32-byte (64 hex character) nullifier into the Nullifier Verification tool to query has_nullifier_been_used on the canister and confirm whether that ballot was included.',
        actionHint: 'The canister returns true if the ballot is part of the homomorphic sum.',
      },
      {
        stepNumber: 3,
        title: '3. Inspect the homomorphic ciphertext sum',
        plainSummary:
          'Expand the Technical Cryptographic Parameters section to inspect the Trustee Master Public Key and the running homomorphic sum points (C1, C2). Every accepted ballot is multiplied into this curve point sum on-chain.',
        actionHint: 'While voting is open, C1 and C2 cannot be decrypted without at least n trustee shares.',
      },
      {
        stepNumber: 4,
        title: '4. Run the "Verify It Yourself" terminal commands',
        plainSummary:
          'Use the copyable dfx canister call commands at the bottom of /verify to query get_election_details, get_encrypted_tally, and has_nullifier_been_used directly against the replica without trusting this web interface.',
        actionHint: 'Once the phase is Complete, verify that proof_verified is true and final_tally matches the verified decryption proof.',
      },
    ],
  },
  admin: {
    roleTitle: 'Election Administrator Walkthrough (4 Steps)',
    roleSubtitle: 'How to initialize an election, register voters, open voting, and transition to tallying.',
    targetRoute: '/admin',
    steps: [
      {
        stepNumber: 1,
        title: '1. Obtain the Trustee Master Public Key',
        plainSummary:
          'Before creating an election, coordinate with the election trustees to generate an n-of-m threshold key setup in the Trustee portal (/trustee) or CLI and copy the 64-character hex Master Public Key.',
        actionHint: 'Never collect or store the trustees’ private key shares.',
      },
      {
        stepNumber: 2,
        title: '2. Create the election in the Setup phase',
        plainSummary:
          'In "Run an election" (/admin), enter the election title, paste the Trustee Master Public Key, set optional start and end timestamps, and confirm initialization.',
        actionHint: 'The Principal ID you use to create the election becomes the canister administrator.',
      },
      {
        stepNumber: 3,
        title: '3. Register eligible voter Principal IDs and open voting',
        plainSummary:
          'Paste one voter Principal ID per line into the Voter Registration box and submit while in the Setup phase. Once the voter roll is complete, click "Open Voting Phase" and confirm.',
        actionHint: 'After you open voting, the voter roll is locked and no additional voters can be added.',
      },
      {
        stepNumber: 4,
        title: '4. Close voting when the deadline ends',
        plainSummary:
          'When the voting period concludes, click "Close Voting & Start Tallying" in Phase Control. This permanently stops ballot submissions and unlocks the Trustee decryption step.',
        actionHint: 'If the scheduled end_time passes before you click Close Voting, the UI displays an expired-window alert prompting you to transition to Tallying.',
      },
    ],
  },
  trustee: {
    roleTitle: 'Trustee Key Custody Walkthrough (4 Steps)',
    roleSubtitle: 'How to generate threshold shares safely and combine n-of-m shares in memory to unlock the final count.',
    targetRoute: '/trustee',
    steps: [
      {
        stepNumber: 1,
        title: '1. Generate n-of-m threshold shares during Setup',
        plainSummary:
          'Choose the threshold n (minimum shares required to decrypt, at least 2) and total trustees m. Click "Generate Threshold Key Shares" to create the Master Public Key and m individual shares in browser WebAssembly.',
        actionHint: 'Distribute one share (index:hex) to each trustee over an independent secure channel and clear the screen immediately.',
      },
      {
        stepNumber: 2,
        title: '2. Keep your share offline while voting is open',
        plainSummary:
          'During the Voting phase, trustees do not take any action in the app. Store your assigned share offline in a hardware-backed password manager or offline storage.',
        actionHint: 'Never paste your share into chat apps, email, or untrusted websites.',
      },
      {
        stepNumber: 3,
        title: '3. Combine at least n shares in browser memory during Tallying',
        plainSummary:
          'Once the administrator closes voting (Phase 3: Tallying), gather at least n trustee shares in the format index:0xhex (one per line) and enter the maximum expected YES tally bound.',
        actionHint: 'This app holds shares only in volatile React state and wipes them automatically on tab hide or unmount.',
      },
      {
        stepNumber: 4,
        title: '4. Submit the Chaum-Pedersen decryption proof',
        plainSummary:
          'Click "Reconstruct, Prove & Finalize Tally". Your browser reconstructs the key in WebAssembly, solves the discrete logarithm for the YES count, generates a Chaum-Pedersen zero-knowledge proof, and submits only the proof and count to the canister.',
        actionHint: 'The reconstructed secret key never leaves your browser and is immediately discarded.',
      },
    ],
  },
};

export const ADMIN_ELECTION_CHECKLIST: Array<{
  id: string;
  phase: string;
  title: string;
  detail: string;
}> = [
  {
    id: 'chk-1',
    phase: 'Before Setup',
    title: 'Coordinate n-of-m Trustee Key Ceremony',
    detail: 'Confirm the threshold (n of m), verify each trustee has received their single share (index:hex), and record only the 64-character hex Master Public Key.',
  },
  {
    id: 'chk-2',
    phase: 'Phase 1: Setup',
    title: 'Initialize Election Parameters on Canister',
    detail: 'Sign in with the Administrator Internet Identity Principal, set the Election Title, Master Public Key, and start/end schedule.',
  },
  {
    id: 'chk-3',
    phase: 'Phase 1: Setup',
    title: 'Register & Audit Eligible Voter Principal IDs',
    detail: 'Collect voter Principal IDs, submit them via Register Voters, and verify the Registered Voters count on /verify matches the expected roll.',
  },
  {
    id: 'chk-4',
    phase: 'Phase 2: Voting',
    title: 'Transition Canister to Voting Phase',
    detail: 'Open voting and announce the Election ID and /vote URL to registered voters.',
  },
  {
    id: 'chk-5',
    phase: 'Phase 3: Tallying',
    title: 'Close Voting Promptly at the Scheduled Deadline',
    detail: 'Transition the canister from Voting to Tallying so trustees can submit the Chaum-Pedersen decryption proof.',
  },
  {
    id: 'chk-6',
    phase: 'Phase 4: Complete',
    title: 'Publish Final Verification Parameters',
    detail: 'Confirm proof_verified is TRUE on /verify and invite observers to run the independent dfx canister call verification commands.',
  },
];

export const TRUSTEE_SHARE_GUIDE: Array<{
  title: string;
  instruction: string;
}> = [
  {
    title: 'In-Memory Only Processing',
    instruction:
      'Shares typed into this page are held strictly in transient browser memory (React component state) and passed directly to the local WebAssembly module. They are never written to localStorage, sessionStorage, IndexedDB, cookies, or network requests, and are wiped automatically on tab hide (pagehide) or unmount.',
  },
  {
    title: 'How to Store Your Share Between Setup and Tallying',
    instruction:
      'Store your single assigned share (e.g. 2:0x...) in an offline encrypted vault or hardware-backed password manager. Do not store all m shares in one place, and never paste shares into cloud notes, AI assistants, or unencrypted messaging channels.',
  },
  {
    title: 'Threshold Requirement (n of m)',
    instruction:
      'Any subset of at least n valid shares from the same key generation ceremony can reconstruct the decryption scalar via Lagrange interpolation. Fewer than n shares reveal zero information about the master secret key.',
  },
  {
    title: 'What If a Trustee Loses Their Share?',
    instruction:
      'As long as at least n of the m trustees still retain their valid shares, the election tally can still be decrypted and proved. If more than (m - n) shares are permanently lost before Tallying completes, the homomorphic ciphertext sum cannot be decrypted and the election must be re-run with a new key setup.',
  },
];

export const SECURITY_PROTECTIONS = [
  {
    title: 'Client-Side Exponential ElGamal Ballot Encryption (BN254 G1)',
    summary:
      'Your vote (0 or 1) is encrypted inside your browser using the rust-compiled voting_crypto_wasm WebAssembly module before any network request is made. Only the compressed elliptic-curve points (C1, C2) leave your browser.',
  },
  {
    title: '1-out-of-2 Disjunctive Chaum-Pedersen Range Proof',
    summary:
      'Every ballot includes a non-interactive zero-knowledge range proof proving that the ciphertext encrypts either 0 (NO) or 1 (YES) under the election’s Trustee Master Public Key. The canister verifies this proof on-chain before adding the ballot to the tally, blocking out-of-range ballot stuffing (such as encrypting 100 or -1).',
  },
  {
    title: 'Deterministic Keccak-256 Nullifiers (Double-Vote Rejection)',
    summary:
      'Your browser derives a 32-byte nullifier hash from the election ID and your voter secret scalar. The canister stores used nullifiers in a set and rejects any duplicate nullifier without storing which Principal submitted which ciphertext.',
  },
  {
    title: 'Homomorphic On-Chain Tallying & Chaum-Pedersen DLEQ Proof Verification',
    summary:
      'The canister multiplies accepted ciphertexts homomorphically on BN254 G1 without ever holding the decryption key. During Tallying, trustees submit the decrypted count together with a Chaum-Pedersen discrete-log equality proof, which the canister verifies mathematically before marking the election Complete.',
  },
  {
    title: 'n-of-m Shamir Secret Sharing for Trustee Key Custody',
    summary:
      'The master decryption key is split across m trustee shares such that at least n trustees must cooperate to reconstruct the decryption scalar in browser memory.',
  },
];

export const SECURITY_LIMITATIONS = [
  {
    title: 'Single-Dealer Threshold Key Setup (No Distributed Key Generation)',
    summary:
      'Threshold key shares are generated by a single dealer call (generate_threshold_trustee_keys) that samples the master secret polynomial in memory, outputs the m shares, and zeroizes the dealer copy. Because it does not use an interactive Distributed Key Generation (DKG) protocol, the device performing initial key generation must be trusted not to retain or leak the full set of shares during Setup.',
  },
  {
    title: 'No Receipt-Freeness or Coercion Resistance',
    summary:
      'Like most remote internet voting designs without a physical voting booth or re-encryption mixnet, this system is not coercion-resistant. A voter who records their secret passphrase or encryption randomness on their own device can demonstrate how they voted to a third party.',
  },
  {
    title: 'Client Device & Browser Endpoint Compromise Out of Scope',
    summary:
      'Ballot encryption happens in the voter’s browser. If the voter’s computer, operating system, or browser is infected with malware or a malicious extension that intercepts keyboard input or DOM events before WebAssembly encryption runs, ballot privacy and integrity on that device cannot be guaranteed by cryptography.',
  },
  {
    title: 'Voter Roll & Phase Transitions Controlled by Canister Administrator',
    summary:
      'The Principal ID that initializes the election controls which Principal IDs are added to registered_voters during Setup and when the canister transitions from Setup to Voting and from Voting to Tallying. Observers can audit the registered voter count on-chain, but eligibility admission depends on the administrator.',
  },
  {
    title: 'On-Chain Call Correlation & Pseudonymous Principal Storage',
    summary:
      'When cast_ballot is called, the canister checks that ic_cdk::caller() is in registered_voters. Although the canister stores registered Principals and used nullifiers in separate sets rather than linking a Principal directly to a ciphertext field, an observer monitoring replica ingress traffic timing or canister state snapshots after each single ballot could correlate when a ballot arrived.',
  },
  {
    title: 'No Independent Third-Party Security Audit',
    summary:
      'This repository is an engineering and research implementation verified by automated unit, property, contract, and end-to-end integration tests. It has not undergone an external commercial or academic cryptographic audit.',
  },
];

export interface RegulatoryFrameworkCitation {
  framework: string;
  officialTitle: string;
  authorityAndYear: string;
  url: string;
  accessedDate: string;
  relevanceToThisSystem: string;
}

export const REGULATORY_CITATIONS: RegulatoryFrameworkCitation[] = [
  {
    framework: 'EU General Data Protection Regulation (GDPR) & CNIL Blockchain Guidance',
    officialTitle:
      'Regulation (EU) 2016/679 (Articles 4(1), 5(1)(c), 17, 25, 35) & CNIL Report: "Blockchain and the GDPR: Solutions for a responsible use of the blockchain in the presence of personal data"',
    authorityAndYear: 'European Parliament & Council (2016); Commission Nationale de l’Informatique et des Libertés (CNIL, September 2018)',
    url: 'https://www.cnil.fr/sites/cnil/files/atoms/files/blockchain_en.pdf',
    accessedDate: '2026-10-31',
    relevanceToThisSystem:
      'Under GDPR Art. 4(1) and CNIL’s 2018 analysis, public keys, Principal IDs, and cryptographic commitments/nullifiers linked to natural persons constitute pseudonymous personal data—not anonymous data. Because canister state on a blockchain is append-only while an election is active, GDPR Art. 17 ("right to erasure") cannot delete individual on-chain records in place. Organizers subject to GDPR must never place names or emails in election titles, must keep voter identity mapping off-chain, and must assess whether a Data Protection Impact Assessment (Art. 35 DPIA) is required before use.',
  },
  {
    framework: 'Council of Europe Standards for E-Voting',
    officialTitle: 'Recommendation CM/Rec(2017)5 of the Committee of Ministers to member States on standards for e-voting',
    authorityAndYear: 'Council of Europe Committee of Ministers (Adopted 14 June 2017)',
    url: 'https://search.coe.int/cm/Pages/result_details.aspx?ObjectId=0900001680726f6f',
    accessedDate: '2026-10-31',
    relevanceToThisSystem:
      'CM/Rec(2017)5 establishes international benchmarks for electronic voting: universal, equal, free, and secret suffrage, cast-as-intended / recorded-as-cast / counted-as-recorded verifiability (Standards 19–25), reliability, and independent certification prior to statutory public elections. While this system provides recorded-as-cast nullifier checks and counted-as-recorded Chaum-Pedersen proofs, statutory elections under CM/Rec(2017)5 require formal procedural controls and independent certification that this software has not undergone.',
  },
  {
    framework: 'U.S. EAC & NIST Voluntary Voting System Guidelines (VVSG 2.0)',
    officialTitle: 'Voluntary Voting System Guidelines (VVSG) Version 2.0 & NIST Special Publication 1273',
    authorityAndYear: 'U.S. Election Assistance Commission (EAC) & National Institute of Standards and Technology (Adopted 10 February 2021)',
    url: 'https://www.eac.gov/voting-equipment/voluntary-voting-system-guidelines',
    accessedDate: '2026-10-31',
    relevanceToThisSystem:
      'VVSG 2.0 Principle 9 ("Software Independence") and NIST guidance emphasize that public governmental elections require auditable voter-verified records and warn against unmanaged client devices over the public internet due to endpoint malware and coercion risks. Accordingly, this web-based system is designed for organizational, academic, or community governance polls—not statutory governmental elections.',
  },
  {
    framework: 'Web Accessibility Standards (W3C WCAG 2.1 Level AA & EN 301 549)',
    officialTitle:
      'W3C Web Content Accessibility Guidelines (WCAG) 2.1 (05 June 2018), ETSI EN 301 549 V3.2.1, and Directive (EU) 2019/882 (European Accessibility Act)',
    authorityAndYear: 'World Wide Web Consortium (W3C, 2018) & European Union (2019)',
    url: 'https://www.w3.org/TR/WCAG21/',
    accessedDate: '2026-10-31',
    relevanceToThisSystem:
      'Digital voting interfaces must be operable by keyboard-only users, low-vision users (minimum 4.5:1 text contrast, 3:1 UI component contrast, 200% text zoom without loss of content, and non-color state indicators), and users who prefer reduced motion. This frontend enforces WCAG 2.1 AA contrast ratios and automated axe-core verification on every route in both light and dark themes.',
  },
];
