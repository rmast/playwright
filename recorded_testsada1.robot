*** Settings ***
Library    Browser


*** Test Cases ***
Recorded Test
    New Browser    chromium    headless=False
    New Context    viewport={'width': 1920, 'height': 1080}
    New Page    https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/
    Click    input[name=username]
    Type Text    input[name=username]    sada1
    Click    input[name=password]
    Type Text    input[name=password]    welkom
    Click    css=input[type='submit'],button[type='submit'],input[name='login'],button[name='login']
    Wait For Load State    networkidle    timeout=30s
    Hover    id=mainmenuform:mainmenu_functie
    Click    id=mainmenuform:mainmenu_functie_nieuw
    Wait For Load State    networkidle    timeout=30s
    Fill Text    [name='functieAlgemeenPage:functienummerFieldInput']    2531
    Fill Text    [name='functieAlgemeenPage:functienummerFieldInput1']    0206
    Fill Text    [name='functieAlgemeenPage:FunctienaamFieldInput']    Compleet-a
    Fill Text    [name='functieAlgemeenPage:ArbeidsplaatsenFieldInput']    1
    Fill Text    [name='functieAlgemeenPage:sbcCodeFieldInput']    444030
    Click    [name='functieAlgemeenPage:nextButton']
    Wait For Load State    networkidle    timeout=30s
    Fill Text    role=textbox[name=/Opleidingseisen/i]    Functie I - 1
    Fill Text    role=textbox[name=/Ervaring/i]    Functie I - 1
    Click    role=button[name=/Opslaan, volgende tabblad »/i]
    Fill Text    role=textbox[name=/Proces/i]    Functie I - 1
    Click    role=button[name=/Opslaan, volgende tabblad »/i]
