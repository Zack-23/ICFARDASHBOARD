"""""""""
async def group_uploaded_files(files: list) -> dict:
    groups_map: dict[tuple, dict] = {}  # internal-only; converted to a list before returning
    no_header_files = []
 
    for file in files:
        content = await file.read()
        text = content.decode("utf-8", errors="ignore")
        raw_headers = extract_header(text)
 
        if not raw_headers:
            # no header row detected -- treat as a data-integrity issue,
            # not as its own "unique structure" group.
            no_header_files.append(file.filename)
            continue
 
        key = normalize_header(raw_headers)
 
        if key not in groups_map:
            groups_map[key] = {
                "headers": list(key),
                "display_headers": raw_headers,  # keep original casing/formatting for display
                "files": [],
            }
 
        groups_map[key]["files"].append(file.filename)
 
    groups = list(groups_map.values())
 
    return {
        "groups": groups,
        "no_header_files": no_header_files,
        "total_files": len(files),
    }
"""""