export interface DSMChoice {
  id: number;
  name: string;
  category: string;
  description: string;
  modelFolder: string;
}

const API = "https://dsm-api.techrealm.ai/models";

export const DSM_CHOICES: DSMChoice[] = [
  { id: 99001, name: "Microsoft Office 2024 Professional Plus MAK", category: "Microsoft Office", description: "Perpetual licence for professional teams", modelFolder: "99001_Microsoft_Office_2024_Professional_Plus_MAK" },
  { id: 99002, name: "Microsoft Office 2024 Standard LTSC MAK", category: "Microsoft Office", description: "Volume licensing for established teams", modelFolder: "99002_Microsoft_Office_2024_Standard_LTSC_MAK" },
  { id: 99003, name: "Microsoft Windows 11 Professional MAK", category: "Windows", description: "Professional edition for business devices", modelFolder: "99003_Microsoft_Windows_11_Professional_MAK" },
  { id: 99004, name: "Microsoft Windows 10 Professional MAK", category: "Windows", description: "Reliable deployment for business devices", modelFolder: "99004_Microsoft_Windows_10_Professional_MAK" },
  { id: 99005, name: "Dynamics 365 Finance", category: "Business Applications", description: "Finance operations for growing organisations", modelFolder: "99005_Dynamics_365_Finance" },
  { id: 99006, name: "Dynamics 365 Project Operations", category: "Business Applications", description: "Project delivery and resource management", modelFolder: "99006_Dynamics_365_Project_Operations" },
  { id: 99007, name: "Microsoft 365 E5", category: "Microsoft 365", description: "Enterprise productivity and security suite", modelFolder: "99007_Microsoft_365_E5" },
  { id: 99008, name: "Autodesk AEC Collection 2027", category: "Autodesk", description: "Architecture, engineering and construction tools", modelFolder: "99008_Autodesk_AEC_Collection_2027" },
];

export const dsmChoiceGlb = (choice: DSMChoice) => `${API}/${choice.id}/${choice.modelFolder}/model.glb`;
