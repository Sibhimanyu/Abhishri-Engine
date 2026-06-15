const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, '../src/components');

const replacements = [
  ["doc(firestore, 'modules', 'fees_accounting', 'student_fees',", "doc(firestore, 'student_fees',"],
  ["collection(firestore, 'modules', 'fees_accounting', 'student_fees')", "collection(firestore, 'student_fees')"],
  ["doc(firestore, 'modules', 'fees_accounting', 'transactions',", "doc(firestore, 'transactions',"],
  ["collection(firestore, 'modules', 'fees_accounting', 'transactions')", "collection(firestore, 'transactions')"],
  ["collection(doc(firestore, 'modules', 'fees_accounting'), 'transactions')", "collection(firestore, 'transactions')"],
  ["doc(firestore, 'modules', 'fees_accounting', 'expenses',", "doc(firestore, 'expenses',"],
  ["collection(firestore, 'modules', 'fees_accounting', 'expenses')", "collection(firestore, 'expenses')"],
  ["collection(doc(firestore, 'modules', 'fees_accounting'), 'expenses')", "collection(firestore, 'expenses')"],
  ["doc(firestore, 'modules', 'fees_accounting', 'staff_wallets',", "doc(firestore, 'staff_wallets',"],
  ["collection(firestore, 'modules', 'fees_accounting', 'staff_wallets')", "collection(firestore, 'staff_wallets')"],
  ["doc(firestore, 'modules', 'fees_accounting', 'plans',", "doc(firestore, 'fee_plans',"],
  ["collection(firestore, 'modules', 'fees_accounting', 'plans')", "collection(firestore, 'fee_plans')"],
  ["doc(firestore, 'modules', 'staff_directory', 'staff',", "doc(firestore, 'staff',"],
  ["collection(firestore, 'modules', 'staff_directory', 'staff')", "collection(firestore, 'staff')"],
  ["doc(firestore, 'modules', directoryPath, 'students',", "doc(firestore, 'students',"],
  ["doc(firestore, 'modules', moduleName, 'students',", "doc(firestore, 'students',"],
  ["collection(doc(firestore, 'modules', directoryPath), 'students')", "collection(firestore, 'students')"],
  ["collection(firestore, 'modules', moduleName, 'students')", "collection(firestore, 'students')"],
  ["collection(doc(firestore, 'modules', 'preschool_directory'), 'students')", "collection(firestore, 'students')"],
  ["collection(doc(firestore, 'modules', 'tuition_directory'), 'students')", "collection(firestore, 'students')"],
  ["collection(firestore, 'modules', 'preschool_directory', 'students')", "collection(firestore, 'students')"],
  ["collection(firestore, 'modules', 'tuition_directory', 'students')", "collection(firestore, 'students')"],
  ["collection(firestore, 'modules', 'student_directory', 'students')", "collection(firestore, 'students')"]
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;
      
      for (const [search, replace] of replacements) {
        // Simple global replace
        const split = content.split(search);
        if (split.length > 1) {
          content = split.join(replace);
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Refactored: ${fullPath}`);
      }
    }
  }
}

processDirectory(directory);
console.log("Refactoring complete.");
