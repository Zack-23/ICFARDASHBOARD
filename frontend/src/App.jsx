    // App.jsx
    // This is the top level of the app.
    // Its job is to:
    // 1. Decide WHAT to show based on current state (upload screen vs result screen)
    // 2. Wire the hook (useUpload) to the components (FileUpload, ValidationResult)
    // 3. Handle what happens when user clicks "Proceed to analysis"
    //
    // It does NOT handle fetch logic (that's useUpload.js)
    // It does NOT handle file picker UI (that's FileUpload.jsx)
    // It does NOT handle result display (that's ValidationResult.jsx)


import UploadTester from "./components/Uploadtester.jsx";

function App() {
  return <UploadTester />;
}

export default App;