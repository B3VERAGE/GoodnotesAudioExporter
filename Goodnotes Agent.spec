# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['run_desktop_app.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('index.html', '.'),
        ('goodnotes_agent.py', '.'),
        ('agent_server.py', '.'),
        ('decode_goodnotes_pb.py', '.'),
        ('backend', 'backend'),
    ],
    hiddenimports=[
        'backend',
        'backend.config',
        'backend.core',
        'backend.core.title_cleaner',
        'backend.core.mp4_parser',
        'backend.core.protobuf_decoder',
        'backend.services',
        'backend.services.icloud_scanner',
        'backend.services.cache_manager',
        'backend.services.audio_exporter',
        'backend.api',
        'backend.api.routes',
        'backend.api.server',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Goodnotes Agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Goodnotes Agent',
)
app = BUNDLE(
    coll,
    name='Goodnotes Agent.app',
    icon='app_icon.icns',
    bundle_identifier=None,
)
