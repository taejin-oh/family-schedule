-- Custom SQL migration file, put your code below! --
-- 상/중/하 텍스트 점수(레거시) → 별점 정수로 변환. 상=5, 중=3, 하=1.
-- score 컬럼이 text→integer로 바뀐 뒤 남아 있던 텍스트 값을 보존하며 변환.
UPDATE `homework_items`
SET `score` = CASE `score`
  WHEN '상' THEN 5
  WHEN '중' THEN 3
  WHEN '하' THEN 1
  ELSE `score`
END
WHERE `score` IN ('상', '중', '하');
