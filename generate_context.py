import os
import datetime

def generate_nested_context():
    ignore_dirs = ['.git', '.vscode', 'node_modules', '.clasp']
    
    print("Memulai pemindaian sub-folder mendalam...")
    
    # 1. Kumpulkan file di root direktori
    core_files = [f for f in os.listdir('.') if os.path.isfile(f) and not f.endswith('.txt') and f != "generate_context.py" and not f.startswith('.')]
    if core_files:
        with open('Context_00_Core.txt', 'w', encoding='utf-8') as f:
            f.write(f"ZETTBOT CONTEXT: CORE FILES (Root)\nGenerated: {datetime.datetime.now()}\n\n")
            for file in core_files:
                try:
                    with open(file, 'r', encoding='utf-8') as cf:
                        f.write(f"==================================================\nFILE: {file}\n==================================================\n\n{cf.read()}\n\n")
                except Exception as e:
                    print(f"Gagal membaca {file}: {e}")
        print("✔️ Berhasil: Context_00_Core.txt")

    # 2. Kumpulkan file per folder dan sub-folder secara rekursif
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        if root == '.':
            continue
            
        code_files = [f for f in files if not f.endswith('.txt') and not f.startswith('.')]
        if code_files:
            folder_slug = root.replace('./', '').replace('.\\', '').replace('/', '_').replace('\\', '_')
            context_name = f"Context_{folder_slug}.txt"
            
            with open(context_name, 'w', encoding='utf-8') as f:
                f.write(f"ZETTBOT CONTEXT: MODULE {folder_slug.upper()}\nGenerated: {datetime.datetime.now()}\n\n")
                for file in code_files:
                    file_path = os.path.join(root, file)
                    clean_path = file_path.replace('./', '').replace('.\\', '').replace('\\', '/')
                    try:
                        with open(file_path, 'r', encoding='utf-8') as cf:
                            f.write(f"==================================================\nFILE: {clean_path}\n==================================================\n\n{cf.read()}\n\n")
                    except Exception as e:
                        print(f"Gagal membaca {clean_path}: {e}")
            print(f"✔️ Berhasil: {context_name}")

    print("\nPemindaian sub-folder selesai!")

if __name__ == "__main__":
    generate_nested_context()