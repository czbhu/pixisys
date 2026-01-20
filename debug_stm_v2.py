
def debug(filepath):
    import sys
    
    print("--- Reading raw bytes ---")
    with open(filepath, 'rb') as f:
        raw = f.read(2000)
    
    # Try CP852
    lines = raw.strip().split(b'\n') # Use simple split
    header_line = lines[0] if len(lines) > 0 else b''
    
    print("\n--- Trying cp852 ---")
    try:
        decoded = header_line.decode('cp852')
        print(decoded)
    except Exception as e:
        print(f"CP852 failed: {e}")

    # Also try indentation of offsets for Line 91
    line91 = None
    for l in lines:
        if l.startswith(b'91'):
            line91 = l
            break
            
    if line91:
        # Decode using cp852
        l91_str = line91.decode('cp852', errors='replace')
        print("\n--- Line 91 Structure (CP852) ---")
        print(l91_str)
        
        # Print Rulers
        ruler10 = ""
        ruler1 = ""
        for i in range(len(l91_str)):
            ruler10 += str(int(i/10)%10)
            ruler1 += str(i%10)
            
        print(ruler10)
        print(ruler1)
        
        # Look for the account number
        # Commonly account numbers are found by regex
        # 3x8 or 2x8 digits
        import re
        acc_nums = re.findall(r'\d{16,24}', l91_str)
        print(f"Candidates for account numbers: {acc_nums}")
        
    line87 = None
    for l in lines:
        if l.startswith(b'87'):
            line87 = l
            break
    if line87:
        l87_str = line87.decode('cp852', errors='replace')
        print("\n--- Line 87 Structure ---")
        print(l87_str)
        # Value date check
        # Indices 96-104
        if len(l87_str) > 104:
            print(f"Val Date [96:104]: '{l87_str[96:104]}'")

debug("/home/ceze/pixisys/minta/STATEMENT_00736841_2025-12-31T00_00_00 (2).stm")
