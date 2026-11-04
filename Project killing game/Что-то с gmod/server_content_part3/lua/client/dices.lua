GM = GM or GAMEMODE
local str = 5
local dex = 5
local int = 5

local function SetStats(locstr, locdex, locint)
    str = locstr
    dex = locdex
    int = locint
end

local function GetStats()
local PlayerName = LocalPlayer():Name()



if PlayerName == "Макото" then 
SetStats(6,5,4)
        elseif PlayerName == "Аканэ Овари" then 
        SetStats(8,10,2)
        elseif PlayerName == "Анджи Йонага" then 
        SetStats(2,4,6)
        elseif PlayerName == "Аой Асахина" then 
        SetStats(6,7,4)
        elseif PlayerName == "Чиаки Нанами" then 
        SetStats(2,2,7)
        elseif PlayerName == "Селестия Люденберг" then 
        SetStats(2,4,7)
        elseif PlayerName == "Бьякуя Тогами" then 
        SetStats(5,5,8)
        elseif PlayerName == "Импостер" then 
        SetStats(5,6,7)
        elseif PlayerName == "Чихиро Фуджисаки" then 
        SetStats(1,1,7)
        elseif PlayerName == "Фуюхико Кузурю" then 
        SetStats(5,5,5)
        elseif PlayerName == "Гонта Гокухара" then 
        SetStats(10,8,1)
        elseif PlayerName == "Гандам Танака" then 
        SetStats(6,6,6)
        elseif PlayerName == "Хаджиме Хината" then 
        SetStats(5,5,6)
        elseif PlayerName == "Изуру Камукура" then 
        SetStats(20,20,20)
        elseif PlayerName == "Хифуми Ямада" then 
        SetStats(3,1,3)
        elseif PlayerName == "Химико Юмено" then 
        SetStats(1,3,2)
        elseif PlayerName == "Хиёко Сайонджи" then 
        SetStats(1,6,3)
        elseif PlayerName == "Ибуки Миода" then 
        SetStats(2,5,2)
        elseif PlayerName == "Джунко Эношима" then 
        SetStats(3,6,10)
        elseif PlayerName == "Мукуро Икусаба" then 
        SetStats(7,10,6)
        elseif PlayerName == "K1-B0" then 
        SetStats(3,3,5)
        elseif PlayerName == "Каедэ Акаматсу" then 
        SetStats(2,4,6)
        elseif PlayerName == "Кайто Момота" then 
        SetStats(6,6,5)
        elseif PlayerName == "Казуичи Сода" then 
        SetStats(5,5,4)
        elseif PlayerName == "Кируми Тоджо" then 
        SetStats(7,7,8)
        elseif PlayerName == "Киётака Ишимару" then 
        SetStats(7,6,5)
        elseif PlayerName == "Кокичи Ома" then 
        SetStats(4,6,8)
        elseif PlayerName == "Корекиё Шингуджи" then 
        SetStats(3,6,7)
        elseif PlayerName == "Кёко" then 
        SetStats(0,0,6)
        elseif PlayerName == "Леон Кувата" then 
        SetStats(6,7,4)
        elseif PlayerName == "Махиру Коидзуми" then 
        SetStats(2,4,5)
        elseif PlayerName == "Маки Харукава" then 
        SetStats(7,10,7)
        elseif PlayerName == "Микан Цумики" then 
        SetStats(3,1,6)
        elseif PlayerName == "Миу Ирума" then 
        SetStats(4,3,4)
        elseif PlayerName == "Мондо Овада" then 
        SetStats(8,6,3)
        elseif PlayerName == "Нагито" then 
        SetStats(1,1,9)
        elseif PlayerName == "Некомару Нидай" then 
        SetStats(9,8,4)
        elseif PlayerName == "Пеко Пекояма" then 
        SetStats(6,9,6)
        elseif PlayerName == "Рантаро" then 
        SetStats(6,7,9)
        elseif PlayerName == "Рёма Хоши" then 
        SetStats(6,10,6)
        elseif PlayerName == "Сакура Огами" then 
        SetStats(10,8,5)
        elseif PlayerName == "Саяка Майзоно" then 
        SetStats(3,5,5)
        elseif PlayerName == "Шуичи" then 
        SetStats(6,6,6)
        elseif PlayerName == "Сония Невермайнд" then 
        SetStats(4,4,6)
        elseif PlayerName == "Тенко Чабашира" then 
        SetStats(7,9,3)
        elseif PlayerName == "Терутеру Ханамура" then 
        SetStats(3,3,5)
        elseif PlayerName == "Токо Фукава" then 
        SetStats(3,8,6)
        elseif PlayerName == "Цумуги Широгане" then 
        SetStats(3,4,4)
        elseif PlayerName == "Ясухиро Хагакуре" then 
        SetStats(5,4,1)
        elseif PlayerName == "Эмма Магороби" then 
        SetStats(6,6,6)
        elseif PlayerName == "Шобай" then 
        SetStats(8,8,10)
        elseif PlayerName == "Хибики Отонокоджи" then 
        SetStats(2,3,5)
        elseif PlayerName == "Ироха Ниджиуэ" then 
        SetStats(1,1,1)
        elseif PlayerName == "Канаде Отонокоджи" then 
        SetStats(3,7,9)
        elseif PlayerName == "Кокоро Митсуме" then 
        SetStats(2,3,8)
        elseif PlayerName == "Хаджиме Макуноучи" then 
        SetStats(8,8,5)
        elseif PlayerName == "Микадо Санноджи" then 
        SetStats(4,6,9)
        elseif PlayerName == "Никей" then 
        SetStats(7,7,6)
        elseif PlayerName == "Сетсука Чибукуро" then 
        SetStats(5,6,5)
        elseif PlayerName == "Шинджи Касай" then 
        SetStats(9,7,3)
        elseif PlayerName == "Теруя Отори" then 
        SetStats(6,6,3)
        elseif PlayerName == "Йоруко Кабуя" then 
        SetStats(2,4,6)
        elseif PlayerName == "Юки" then 
        SetStats(3,5,8)
        elseif PlayerName == "Сора" then 
        SetStats(7,7,6)
        elseif PlayerName == "Юри Кагарин" then 
        SetStats(6,7,9)
        elseif PlayerName == "Рёта" then 
        SetStats(4,10,5)
        elseif PlayerName == "Нико" then 
        SetStats(9,9,4)
        elseif PlayerName == "Марин Мизута" then 
        SetStats(1,1,4)
        elseif PlayerName == "Сейши Йодогава" then 
        SetStats(7,9,8)
        elseif PlayerName == "Аюму Фуджимори" then 
        SetStats(3,3,6)
        elseif PlayerName == "Акира Цучия" then 
        SetStats(2,2,6)
        elseif PlayerName == "Арума Тодороки" then 
        SetStats(6,6,4)
        elseif PlayerName == "Касуми Изумо" then 
        SetStats(2,3,4)
        elseif PlayerName == "Казуоми Самеджима" then 
        SetStats(8,8,2)
        elseif PlayerName == "Кего Сакума" then 
        SetStats(5,6,6)
        elseif PlayerName == "Майко Кагура" then 
        SetStats(5,6,5)
        elseif PlayerName == "Микото" then 
        SetStats(5,6,7)
        elseif PlayerName == "Мисузу Айсака" then 
        SetStats(3,3,5)
        elseif PlayerName == "Мицунари Кога" then 
        SetStats(6,8,5)
        elseif PlayerName == "Наруми Осоне" then 
        SetStats(2,2,3)
        elseif PlayerName == "Сайджи Рокудо" then 
        SetStats(5,4,5)
        elseif PlayerName == "Рёко Отонаши" then 
        SetStats(3,6,10)
        elseif PlayerName == "Комару" then 
        SetStats(4,8,6)
        elseif PlayerName == "Сейко Кимура" then 
        SetStats(3,3,5)
        elseif PlayerName == "Покет" then 
        SetStats(6,7,4)
        elseif PlayerName == "Грисп" then 
        SetStats(8,8,4)
        elseif PlayerName == "Кросс" then 
        SetStats(4,4,8)
        elseif PlayerName == "Энигма" then 
        SetStats(6,6,6)
        elseif PlayerName == "Анон" then 
        SetStats(2,3,6)
        elseif PlayerName == "Мораитеру" then 
        SetStats(2,3,6)
        elseif PlayerName == "Якси" then 
        SetStats(8,8,4)
        elseif PlayerName == "Рок" then 
        SetStats(4,5,5)
        elseif PlayerName == "Рокс" then 
        SetStats(4,4,6)
        elseif PlayerName == "Рисси" then 
        SetStats(1,3,5)
        elseif PlayerName == "Скарлет" then 
        SetStats(3,3,6)
        elseif PlayerName == "Твин" then 
        SetStats(5,5,5)
        elseif PlayerName == "Канцел" then 
        SetStats(2,3,5)
        elseif PlayerName == "Корза" then 
        SetStats(5,5,8)

        elseif PlayerName == "Хесед" then 
        SetStats(4,4,7)
        elseif PlayerName == "Хару Такиби" then 
        SetStats(4,5,6)
        elseif PlayerName == "Хано Хананокизу" then 
        SetStats(4,5,6)
        elseif PlayerName == "Мишель Кайзер" then 
        SetStats(4,6,7)
        elseif PlayerName == "Ари" or PlayerName == "Аризу Канэко" then 
        SetStats(5,7,6)
        elseif PlayerName == "Кэрон Шиока" then 
        SetStats(4,6,6)
        elseif PlayerName == "Ки Дон Сон" then 
        SetStats(2,2,6)
        elseif PlayerName == "Рамбл Тауэ" then 
        SetStats(3,4,6)
        elseif PlayerName == "Юкио Такэда" then 
        SetStats(3,5,6)
        elseif PlayerName == "Леонье Солгейм" then 
        SetStats(4,5,6)
        elseif PlayerName == "Реджинальд Блэкмен" then 
        SetStats(4,7,9)
        elseif PlayerName == "Сан Хо Сон" then 
        SetStats(7,3,5)
        elseif PlayerName == "Теруми Тодо" then 
        SetStats(3,6,6)
        elseif PlayerName == "Дори Мори" then 
        SetStats(3,5,7)



end
return str, dex, int
end

local nagitoRofl = false

function RollDice(typeOfDice, advantage)

GetStats()

if (LocalPlayer():Nick() =="Сейши Йодогава") then
    local time = math.floor(CurTime()) + 1200
    while time > 3600 do
        time = time - 3600
    end
    local hour = math.floor(time / 150)
    if (hour > 6) then
        SetStats(6,6,4)
    else
        SetStats(7,7,3)
    end
end 

local min = 4
local max = 8
local randomNumber
local typeNumber

if advantage == "advantage" then
    min = 6
    max = 10
elseif advantage == "disadvantage" then
    min = 2
    max = 6
end

if typeOfDice == "str" then
typeNumber = str
elseif typeOfDice == "dex" then
typeNumber = dex
elseif typeOfDice == "int" then
typeNumber = int
end

local name = LocalPlayer():Name()
if typeNumber ~= null then
randomNumber = math.random(typeNumber*min,typeNumber*max)
else
    if name == "Макото Наеги" or name == "Юки Маеда" or name == "Анджи Йонага" or name == "Канцел" or name == "Изуру Камукура" or name == "Селестия Люденберг" then
        local firstnum = math.random(1,100)
        local secnum = math.random(1,100)
        if firstnum > secnum then
            randomNumber = firstnum
        else
            randomNumber = secnum
        end
    elseif name == "Аюму Фуджимори" then
        local firstnum = math.random(1,100)
        local secnum = math.random(1,100)
        if firstnum < secnum then
            randomNumber = firstnum
        else
            randomNumber = secnum
        end
    elseif name == "Нагито Комаеда" then
        if nagitoRofl then
            randomNumber = math.random(51,100)
        else
            randomNumber = math.random(1,50)
        end
        nagitoRofl = !nagitoRofl
    else
    randomNumber = math.random(1,100)
end
end
local tbl = {typeOfDice,randomNumber,advantage}
net.Start("SendDiceToServer")
net.WriteTable(tbl)
net.SendToServer()
end

--RollDice("str1","disadvantage1")


print ('dices has been autoruned')