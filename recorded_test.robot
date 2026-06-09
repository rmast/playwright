*** Settings ***
Library    Browser
Library    String


*** Test Cases ***
Recorded Test
    New Browser    chromium    headless=False
    New Context    viewport={'width': 1920, 'height': 1080}
    New Page    https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/
    Wait For Load State    networkidle    timeout=30s
    Type Text    input[name=username]    sada1
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
    Click    role=link[name=/^Bekwaamheden$/]
    Fill Text    role=textbox[name=/Opleidingseisen/i]    Functie I - 1
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
    Fill Text    role=textbox[name=/Proces/i]    Functie I - 1
    Click    role=link[name=/Taken/i]
    Fill Text    id=functieTakenPage:Omschrijving1    Functie I - 1
    Fill Text    [id="functieTakenPage:Percentage1"]    100
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
    Fill Text    id=functieArbeidspatroonPage:dagelijksFieldInput    40
    Fill Text    role=textbox[name=/Uren\ per\ dag\ \-\ Niet\ dagelijks/i]    40
    Check Checkbox    id=functieArbeidspatroonPage:dagFieldInput
    Check Checkbox    id=functieArbeidspatroonPage:dagFieldInput1
    Check Checkbox    id=functieArbeidspatroonPage:dagdeelFieldInput
    Check Checkbox    id=functieArbeidspatroonPage:dagdeelFieldInput1
    Click    [id="functieArbeidspatroonPage:toelichtingFieldInput"]
    Fill Text    role=textbox[name=/Uren\ per\ dag\ \-\ Dagelijks/i]    9
    Clear Text    role=textbox[name=/Uren\ per\ dag\ \-\ Niet\ dagelijks/i]
    Click    [id="functieArbeidspatroonPage:toelichtingFieldInput"]
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
    Click    role=link[name=/^Loongegevens$/]
    Fill Text    id=functieLoonGegevensPage:UrenPerWeekFTFieldInput    40
    Fill Text    id=functieLoonGegevensPage:UrenPerWeekContractFieldInput    40
    Click    role=button[name=/Opslaan,\ volgende\ tabblad\ »/i]
    New Page    https://ln-o2-svc-cbb-vhn.o-dc.ba.uwv.nl/cbbs/functie/analyseGegevens.jsf
    Wait For Load State    networkidle    timeout=30s
    Click    id=functieAnalysePage:nextButton
    Set Belastingpunt Detail    1.8.2    Kenmerkend    ADA toelichting
    Set Belastingpunt Detail    1.8.3    Kenmerkend    ADA toelichting


*** Keywords ***
Set Belastingpunt Detail
    [Arguments]    ${corr_punt}    ${optie}    ${toelichting}
    Open Belastingpunt By Corr Punt    ${corr_punt}
    Verify Belastingpunt Detail    ${corr_punt}
    Set Belastingpunt Optie En Toelichting    ${optie}    ${toelichting}


Open Belastingpunt By Corr Punt
    [Arguments]    ${corr_punt}
    ${row_link}=    Set Variable    xpath=//tr[td[normalize-space()='${corr_punt}']]//a[contains(normalize-space(.),'Aanpassen')]
    Wait For Elements State    ${row_link}    visible    timeout=10s
    Click    ${row_link}
    Wait For Elements State    id=functieBelastingPage:belastingpuntDetailDiv    visible    timeout=10s


Verify Belastingpunt Detail
    [Arguments]    ${corr_punt}
    ${detail_text}=    Get Text    id=functieBelastingPage:belastingpuntDetailDiv
    Should Contain    ${detail_text}    Corr. beoordelingspunt ${corr_punt}


Set Belastingpunt Optie En Toelichting
    [Arguments]    ${optie}    ${toelichting}
    ${optie_lc}=    Convert To Lower Case    ${optie}
    Run Keyword If    '${optie_lc}' == 'kenmerkend'    Check Checkbox    id=functieBelastingPage:Optie:1
    ...    ELSE IF    '${optie_lc}' == 'niet kenmerkend'    Check Checkbox    id=functieBelastingPage:Optie:0
    ...    ELSE    Fail    Onbekende optie '${optie}'. Gebruik 'Kenmerkend' of 'Niet kenmerkend'.
    Fill Text    [id="functieBelastingPage:ToelichtingIdFieldInput"]    ${toelichting}
    Click    id=functieBelastingPage:nextBelastingPunt
