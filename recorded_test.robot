*** Settings ***
Library    Browser


*** Test Cases ***
Recorded Test
    New Browser    chromium    headless=False
    New Context    viewport={'width': 1920, 'height': 1080}
    New Page    https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/
    Wait For Load State    networkidle    timeout=30s
    Type Text    input[type=text][name=username]    sada1
    Type Text    input[name=password]    welkom
    Click    css=input[type='submit'],button[type='submit'],input[name='login'],button[name='login']
    Wait For Load State    networkidle    timeout=30s
    Hover    id=mainmenuform:mainmenu_functie
    Click    id=mainmenuform:mainmenu_functie_nieuw
    Fill Text    input[name="functieAlgemeenPage:functienummerFieldInput"]    2531
    Fill Text    input[name="functieAlgemeenPage:functienummerFieldInput1"]    0206
    Fill Text    input[name="functieAlgemeenPage:FunctienaamFieldInput"]    Compleet-a
    Fill Text    input[name="functieAlgemeenPage:ArbeidsplaatsenFieldInput"]    1
    Fill Text    input[name="functieAlgemeenPage:sbcCodeFieldInput"]    444030
    Click    id=functieAlgemeenPage:nextButton
    Click    role=button[name=/Login/i]
    New Page    https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/functie/algemeen.jsf
    Wait For Load State    networkidle    timeout=30s
    Click    role=link[name=/^Bekwaamheden$/]
    Fill Text    role=textbox[name=/Opleidingseisen/i]    Functie I - 1
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
    Fill Text    role=textbox[name=/Proces/i]    Functie I - 1
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
    Fill Text    id=functieTakenPage:Omschrijving1    Functie I - 1
    Fill Text    [id="functieTakenPage:Percentage1"]    100
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
    Fill Text    id=functieArbeidspatroonPage:dagelijksFieldInput    9
    Check Checkbox    id=functieArbeidspatroonPage:dagFieldInput
    Fill Text    id=functieArbeidspatroonPage:dagelijksFieldInput    9
    Check Checkbox    id=functieArbeidspatroonPage:dagFieldInput1
    Check Checkbox    id=functieArbeidspatroonPage:dagdeelFieldInput
    Check Checkbox    id=functieArbeidspatroonPage:dagdeelFieldInput1
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
    Click    role=link[name=/^Loongegevens$/]
    Fill Text    id=functieLoonGegevensPage:UrenPerWeekFTFieldInput    40
    Fill Text    id=functieLoonGegevensPage:UrenPerWeekContractFieldInput    40
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
